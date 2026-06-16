using System.Text;
using System.Text.RegularExpressions;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// RFC 3986 resource-URI and RFC 6570 URI-Template validation, variable extraction, expansion, and
/// matching for the Resources feature (spec §17.4). This is the C# counterpart of the TypeScript
/// SDK's <c>isResourceUri</c> / <c>isUriTemplate</c> / <c>uriTemplateVariables</c> helpers, plus the
/// expand/match machinery the server runtime uses to turn a concrete <c>resources/read</c> URI back
/// into the variables of a registered template.
/// </summary>
/// <remarks>
/// <para>
/// The validation surface intentionally mirrors the TS grammar checks exactly so the two SDKs accept
/// and reject the same strings:
/// </para>
/// <list type="bullet">
///   <item><description><see cref="IsResourceUri"/> — an RFC 3986 absolute URI with a conformant
///     scheme (a relative reference with no scheme is rejected, R-17.4-a/b).</description></item>
///   <item><description><see cref="IsUriTemplate"/> — the full RFC 6570 grammar: literals interspersed
///     with balanced <c>{…}</c> expressions, each an OPTIONAL leading operator from <c>+#./;?&amp;</c>
///     followed by one or more comma-separated <c>varspec</c>s, where a <c>varspec</c> is a
///     <c>varname</c> with an OPTIONAL <c>*</c> (explode) or <c>:N</c> (prefix, 1–9999) modifier
///     (R-17.4-m).</description></item>
///   <item><description><see cref="Variables"/> — the referenced variable names in first-seen order
///     with duplicates removed, operators and modifiers stripped (R-17.4-n).</description></item>
/// </list>
/// <para>
/// <see cref="Expand"/> performs Level 1–4 expansion and <see cref="TryMatch"/> compiles a template
/// into a capturing matcher that recovers each variable's value from a concrete URI — replacing the
/// previous trivial <c>{name}</c>-only regex in the server runtime.
/// </para>
/// </remarks>
public static class UriTemplate
{
  /// <summary>The RFC 6570 expression operator characters (Level 2–4): <c>+ # . / ; ? &amp;</c>.</summary>
  private const string OperatorChars = "+#./;?&";

  /// <summary>RFC 3986 scheme grammar: <c>ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )</c> followed by <c>:</c>.</summary>
  private static readonly Regex SchemeRe =
    new("^[a-zA-Z][a-zA-Z0-9+.\\-]*:", RegexOptions.Compiled | RegexOptions.CultureInvariant);

  /// <summary>RFC 6570 <c>varname</c>: one or more <c>varchar</c>s (ALPHA / DIGIT / <c>_</c> / pct-encoded), dot-joined.</summary>
  private static readonly Regex VarNameRe = new(
    "^(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*$",
    RegexOptions.Compiled | RegexOptions.CultureInvariant);

  /// <summary>An RFC 6570 <c>:N</c> prefix length: a positive integer of 1–4 digits (max 9999 per the RFC).</summary>
  private static readonly Regex PrefixLenRe =
    new("^[1-9][0-9]{0,3}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

  // ─── RFC 3986 resource-URI validation (§17.4) ────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a string usable as a concrete
  /// <c>Resource.uri</c> [RFC 3986]: it carries a conformant scheme and parses as an absolute URI. A
  /// relative reference (no scheme) or an empty string is rejected, because a concrete resource URI
  /// MUST identify the resource uniquely. (§17.4, R-17.4-a, R-17.4-b)
  /// </summary>
  /// <remarks>
  /// Mirrors the TS implementation, which combines a scheme-grammar pre-check with the WHATWG
  /// <c>URL</c> parser (absolute URIs only). Here the .NET <see cref="Uri"/> parser plays the role of
  /// the WHATWG parser, so values such as <c>urn:isbn:0451450523</c> (empty authority) and
  /// <c>custom-scheme:thing</c> are accepted consistently.
  /// </remarks>
  /// <param name="value">The candidate URI string.</param>
  /// <returns><c>true</c> when the value is a non-empty absolute URI with a scheme.</returns>
  public static bool IsResourceUri(string? value)
  {
    if (string.IsNullOrEmpty(value)) return false;
    if (!SchemeRe.IsMatch(value)) return false;
    return Uri.TryCreate(value, UriKind.Absolute, out _);
  }

  /// <summary>
  /// Extracts the lower-cased scheme of a URI string, or <c>null</c> when the value is not a string
  /// with a conformant RFC 3986 scheme (everything before the first <c>:</c>). (§17.9, R-17.9-e)
  /// </summary>
  /// <param name="value">The candidate URI string.</param>
  /// <returns>The lower-cased scheme, or <c>null</c> when no conformant scheme is present.</returns>
  public static string? Scheme(string? value)
  {
    if (value is null) return null;
    var match = Regex.Match(value, "^([a-zA-Z][a-zA-Z0-9+.\\-]*):", RegexOptions.CultureInvariant);
    return match.Success ? match.Groups[1].Value.ToLowerInvariant() : null;
  }

  // ─── RFC 6570 URI-Template grammar validation (§17.4) ────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> conforms to the URI Template grammar of
  /// [RFC 6570]: literal characters interspersed with well-formed <c>{…}</c> variable expressions
  /// (for example <c>file:///{path}</c>, <c>db://{table}/{id}</c>, <c>https://api/{+base}/items{?q,page}</c>).
  /// A literal-only string (no expressions) is a valid template. (§17.4, R-17.4-m)
  /// </summary>
  /// <remarks>
  /// Verifies brace balance and that every expression is non-empty and contains a valid variable
  /// list — an OPTIONAL leading operator from <c>+#./;?&amp;</c> followed by one or more
  /// comma-separated <c>varspec</c>s. A literal <c>{</c> or <c>}</c> outside a balanced expression,
  /// an empty expression <c>{}</c>, or a nested opener is rejected. An empty string is NOT a valid
  /// template (it identifies no resource family), matching the TS contract.
  /// </remarks>
  /// <param name="value">The candidate URI-template string.</param>
  /// <returns><c>true</c> when the value is a well-formed RFC 6570 template.</returns>
  public static bool IsUriTemplate(string? value)
  {
    if (string.IsNullOrEmpty(value)) return false;

    var i = 0;
    while (i < value.Length)
    {
      var ch = value[i];
      if (ch == '}') return false; // a closing brace with no matching opener
      if (ch != '{')
      {
        i += 1;
        continue;
      }

      // Parse one `{…}` expression.
      var close = value.IndexOf('}', i + 1);
      if (close == -1) return false; // unbalanced opening brace
      var body = value.Substring(i + 1, close - (i + 1));
      if (body.Length == 0) return false; // empty expression `{}`
      if (body.Contains('{')) return false; // nested / unbalanced opener inside

      // Optional leading operator.
      if (OperatorChars.IndexOf(body[0]) >= 0)
      {
        body = body[1..];
        if (body.Length == 0) return false; // operator with no variables
      }

      foreach (var spec in body.Split(','))
      {
        if (!IsValidVarspec(spec)) return false;
      }

      i = close + 1;
    }

    return true;
  }

  /// <summary>Validates a single RFC 6570 <c>varspec</c>: a <c>varname</c> with an OPTIONAL <c>*</c> or <c>:N</c> modifier.</summary>
  private static bool IsValidVarspec(string spec)
  {
    if (spec.Length == 0) return false;

    // Explode modifier: trailing `*`.
    if (spec.EndsWith('*'))
    {
      return VarNameRe.IsMatch(spec[..^1]);
    }

    // Prefix modifier: `:N` with N a positive integer (max length 9999 per RFC 6570).
    var colon = spec.IndexOf(':');
    if (colon != -1)
    {
      var name = spec[..colon];
      var len = spec[(colon + 1)..];
      if (!PrefixLenRe.IsMatch(len)) return false;
      return VarNameRe.IsMatch(name);
    }

    return VarNameRe.IsMatch(spec);
  }

  // ─── Variable enumeration (§17.4) ────────────────────────────────────────────────────────────

  /// <summary>
  /// Extracts the variable names referenced by a URI template's <c>{…}</c> expressions, in first-seen
  /// order with duplicates removed. Useful for driving completion (§19) or prompting the user for
  /// values before expansion. (§17.4, R-17.4-n)
  /// </summary>
  /// <remarks>
  /// Returns an empty list for a literal-only template. The leading operator and any <c>*</c>/<c>:N</c>
  /// modifiers are stripped from the reported names. Does NOT itself validate the template; pair it
  /// with <see cref="IsUriTemplate"/> when validation is required.
  /// </remarks>
  /// <param name="template">The URI template to inspect.</param>
  /// <returns>The distinct variable names, in first-seen order.</returns>
  public static IReadOnlyList<string> Variables(string template)
  {
    ArgumentNullException.ThrowIfNull(template);
    var names = new List<string>();
    var seen = new HashSet<string>(StringComparer.Ordinal);

    foreach (Match match in Regex.Matches(template, "\\{([^{}]+)\\}", RegexOptions.CultureInvariant))
    {
      var body = match.Groups[1].Value;
      if (OperatorChars.IndexOf(body[0]) >= 0) body = body[1..];
      foreach (var spec in body.Split(','))
      {
        var name = StripModifiers(spec);
        if (name.Length > 0 && seen.Add(name))
        {
          names.Add(name);
        }
      }
    }

    return names;
  }

  /// <summary>Strips a trailing <c>*</c> explode modifier or a <c>:N</c> prefix modifier from a <c>varspec</c>.</summary>
  private static string StripModifiers(string spec)
  {
    var star = spec.IndexOf('*');
    if (star >= 0) spec = spec[..star];
    var colon = spec.IndexOf(':');
    if (colon >= 0) spec = spec[..colon];
    return spec;
  }

  // ─── Expansion (RFC 6570 Levels 1–4) ─────────────────────────────────────────────────────────

  /// <summary>
  /// Expands a URI template against a set of variable values, producing a concrete URI (RFC 6570
  /// Levels 1–4). A client substitutes the named <c>{…}</c> variables to form a <c>resources/read</c>
  /// URI. (§17.4, R-17.4-m, R-17.4-n)
  /// </summary>
  /// <remarks>
  /// Supports the simple expansion (no operator) and the reserved (<c>+</c>), fragment (<c>#</c>),
  /// label (<c>.</c>), path-segment (<c>/</c>), path-style (<c>;</c>), query (<c>?</c>), and
  /// query-continuation (<c>&amp;</c>) operators, including the <c>*</c> explode (over list values)
  /// and <c>:N</c> prefix modifiers. An undefined variable contributes nothing (per the RFC). Scalar
  /// values are looked up in <paramref name="values"/>; a value MAY be a single string or a list of
  /// strings (via <see cref="UriTemplateValues"/>).
  /// </remarks>
  /// <param name="template">The RFC 6570 template.</param>
  /// <param name="values">The variable bindings.</param>
  /// <returns>The expanded concrete URI.</returns>
  /// <exception cref="ArgumentException">When the template is malformed (unbalanced braces).</exception>
  public static string Expand(string template, UriTemplateValues values)
  {
    ArgumentNullException.ThrowIfNull(template);
    ArgumentNullException.ThrowIfNull(values);

    var builder = new StringBuilder(template.Length);
    var i = 0;
    while (i < template.Length)
    {
      var ch = template[i];
      if (ch != '{')
      {
        builder.Append(ch);
        i += 1;
        continue;
      }

      var close = template.IndexOf('}', i + 1);
      if (close == -1) throw new ArgumentException($"Malformed URI template (unbalanced '{{'): {template}", nameof(template));
      var body = template.Substring(i + 1, close - (i + 1));
      ExpandExpression(body, values, builder);
      i = close + 1;
    }

    return builder.ToString();
  }

  /// <summary>Expands one <c>{…}</c> expression body into <paramref name="output"/>.</summary>
  private static void ExpandExpression(string body, UriTemplateValues values, StringBuilder output)
  {
    var op = '\0';
    if (body.Length > 0 && OperatorChars.IndexOf(body[0]) >= 0)
    {
      op = body[0];
      body = body[1..];
    }

    var (first, sep, named, ifEmpty, allowReserved) = OperatorBehavior(op);
    var emittedAny = false;

    foreach (var spec in body.Split(','))
    {
      if (spec.Length == 0) continue;
      var explode = spec.EndsWith('*');
      var name = explode ? spec[..^1] : spec;
      var prefixLen = -1;
      var colon = name.IndexOf(':');
      if (colon >= 0)
      {
        prefixLen = int.Parse(name[(colon + 1)..], System.Globalization.CultureInfo.InvariantCulture);
        name = name[..colon];
      }

      if (!values.TryGet(name, out var resolved) || resolved.Count == 0)
      {
        continue; // an undefined variable contributes nothing
      }

      output.Append(emittedAny ? sep : first);
      emittedAny = true;

      if (resolved.Count == 1)
      {
        var raw = resolved[0];
        var value = prefixLen >= 0 && raw.Length > prefixLen ? raw[..prefixLen] : raw;
        AppendNameValue(output, name, value, named, ifEmpty, allowReserved);
      }
      else
      {
        // List value: explode emits each element separated by `sep` (named keeps the name per
        // element); otherwise a comma-joined single value.
        if (explode)
        {
          for (var k = 0; k < resolved.Count; k++)
          {
            if (k > 0) output.Append(sep);
            AppendNameValue(output, name, resolved[k], named, ifEmpty, allowReserved);
          }
        }
        else
        {
          if (named)
          {
            output.Append(Encode(name, reserved: false));
            output.Append('=');
          }
          for (var k = 0; k < resolved.Count; k++)
          {
            if (k > 0) output.Append(',');
            output.Append(Encode(resolved[k], allowReserved));
          }
        }
      }
    }
  }

  /// <summary>Appends a single <c>name=value</c> (named) or <c>value</c> token applying the empty-value rule.</summary>
  private static void AppendNameValue(
    StringBuilder output, string name, string value, bool named, string ifEmpty, bool allowReserved)
  {
    if (named)
    {
      output.Append(Encode(name, reserved: false));
      if (value.Length == 0)
      {
        output.Append(ifEmpty); // `=` for ;/?/& with empty value, or nothing for `;`
        return;
      }

      output.Append('=');
    }

    output.Append(Encode(value, allowReserved));
  }

  /// <summary>The per-operator separators and flags governing RFC 6570 expansion.</summary>
  private static (string First, string Sep, bool Named, string IfEmpty, bool AllowReserved) OperatorBehavior(char op) => op switch
  {
    '+' => ("", ",", false, "", true),
    '#' => ("#", ",", false, "", true),
    '.' => (".", ".", false, "", false),
    '/' => ("/", "/", false, "", false),
    ';' => (";", ";", true, "", false),
    '?' => ("?", "&", true, "=", false),
    '&' => ("&", "&", true, "=", false),
    _ => ("", ",", false, "", false),
  };

  /// <summary>
  /// Percent-encodes <paramref name="value"/> for inclusion in an expanded URI. When
  /// <paramref name="reserved"/> is <c>true</c> (the <c>+</c>/<c>#</c> operators) the RFC 3986
  /// reserved and pct-encoded characters are preserved; otherwise everything outside the unreserved
  /// set is escaped.
  /// </summary>
  private static string Encode(string value, bool reserved)
  {
    var sb = new StringBuilder(value.Length);
    var i = 0;
    while (i < value.Length)
    {
      var c = value[i];
      if (IsUnreserved(c) || (reserved && (IsReserved(c) || IsAlreadyPctEncoded(value, i))))
      {
        sb.Append(c);
        i += 1;
      }
      else
      {
        foreach (var b in Encoding.UTF8.GetBytes(c.ToString()))
        {
          sb.Append('%').Append(b.ToString("X2", System.Globalization.CultureInfo.InvariantCulture));
        }

        i += 1;
      }
    }

    return sb.ToString();
  }

  private static bool IsUnreserved(char c) =>
    c is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' or '-' or '.' or '_' or '~';

  private static bool IsReserved(char c) =>
    ":/?#[]@!$&'()*+,;=".IndexOf(c) >= 0;

  private static bool IsAlreadyPctEncoded(string value, int i) =>
    value[i] == '%' && i + 2 < value.Length &&
    Uri.IsHexDigit(value[i + 1]) && Uri.IsHexDigit(value[i + 2]);

  // ─── Matching (recover variables from a concrete URI) ────────────────────────────────────────

  /// <summary>
  /// Compiles a URI template into a matcher that recovers each simple variable's value from a
  /// concrete URI. This replaces the server runtime's previous trivial <c>{name}</c>-only regex,
  /// handling Level-1 variables (and stripping the operator/modifiers of any others) so a
  /// <c>resources/read</c> URI can be routed back to its registered template. (§17.4, R-17.4-n)
  /// </summary>
  /// <remarks>
  /// The matcher captures each <c>{name}</c> simple expression as a non-slash run, mirroring the
  /// behavior the runtime relied on. Operators and modifiers in an expression are tolerated for
  /// validation purposes but only the bare variable name(s) are captured, so an expression list is
  /// matched as a single segment per variable. Use <see cref="IsUriTemplate"/> first to reject a
  /// malformed template.
  /// </remarks>
  /// <param name="template">The RFC 6570 template.</param>
  /// <returns>A <see cref="UriTemplateMatcher"/> bound to the template.</returns>
  public static UriTemplateMatcher CompileMatcher(string template)
  {
    ArgumentNullException.ThrowIfNull(template);
    var pattern = new StringBuilder("^");
    var captured = new List<string>();
    var i = 0;
    while (i < template.Length)
    {
      if (template[i] == '{')
      {
        var close = template.IndexOf('}', i + 1);
        if (close == -1) throw new ArgumentException($"Malformed URI template (unbalanced '{{'): {template}", nameof(template));
        var body = template.Substring(i + 1, close - (i + 1));
        if (body.Length > 0 && OperatorChars.IndexOf(body[0]) >= 0) body = body[1..];
        foreach (var spec in body.Split(','))
        {
          var name = StripModifiers(spec);
          if (name.Length == 0) continue;
          // Use a unique group name; duplicate variable names would be illegal regex group names.
          var groupName = "v" + captured.Count.ToString(System.Globalization.CultureInfo.InvariantCulture);
          pattern.Append("(?<").Append(groupName).Append(">[^/]+)");
          captured.Add(name);
        }

        i = close + 1;
      }
      else
      {
        pattern.Append(Regex.Escape(template[i].ToString()));
        i += 1;
      }
    }

    pattern.Append('$');
    var regex = new Regex(pattern.ToString(), RegexOptions.Compiled | RegexOptions.CultureInvariant);
    return new UriTemplateMatcher(regex, captured);
  }

  /// <summary>
  /// Convenience: tests whether <paramref name="uri"/> matches <paramref name="template"/> and, when
  /// it does, yields the recovered variable bindings. (§17.4)
  /// </summary>
  /// <param name="template">The RFC 6570 template.</param>
  /// <param name="uri">The concrete URI to match.</param>
  /// <param name="variables">When matched, the recovered <c>name → value</c> map.</param>
  /// <returns><c>true</c> when the URI matches the template.</returns>
  public static bool TryMatch(string template, string uri, out IReadOnlyDictionary<string, string> variables) =>
    CompileMatcher(template).TryMatch(uri, out variables);
}

/// <summary>
/// A compiled matcher for a single URI template that recovers variable values from a concrete URI
/// (spec §17.4). Produced by <see cref="UriTemplate.CompileMatcher"/>.
/// </summary>
public sealed class UriTemplateMatcher
{
  private readonly Regex _regex;
  private readonly IReadOnlyList<string> _variableNames;

  internal UriTemplateMatcher(Regex regex, IReadOnlyList<string> variableNames)
  {
    _regex = regex;
    _variableNames = variableNames;
  }

  /// <summary>The variable names captured by this template, in order of first appearance.</summary>
  public IReadOnlyList<string> VariableNames => _variableNames;

  /// <summary>
  /// Attempts to match <paramref name="uri"/> against the template, recovering each variable's value.
  /// </summary>
  /// <param name="uri">The concrete URI to match.</param>
  /// <param name="variables">When matched, the recovered <c>name → value</c> map (later duplicates win).</param>
  /// <returns><c>true</c> when the URI matches.</returns>
  public bool TryMatch(string uri, out IReadOnlyDictionary<string, string> variables)
  {
    ArgumentNullException.ThrowIfNull(uri);
    var match = _regex.Match(uri);
    if (!match.Success)
    {
      variables = new Dictionary<string, string>(StringComparer.Ordinal);
      return false;
    }

    var map = new Dictionary<string, string>(StringComparer.Ordinal);
    for (var i = 0; i < _variableNames.Count; i++)
    {
      var group = match.Groups["v" + i.ToString(System.Globalization.CultureInfo.InvariantCulture)];
      if (group.Success) map[_variableNames[i]] = group.Value;
    }

    variables = map;
    return true;
  }
}

/// <summary>
/// A simple, immutable set of variable bindings for <see cref="UriTemplate.Expand"/> (spec §17.4):
/// each variable maps to a single scalar string or a list of strings (for the explode modifier).
/// </summary>
public sealed class UriTemplateValues
{
  private readonly IReadOnlyDictionary<string, IReadOnlyList<string>> _values;

  private UriTemplateValues(IReadOnlyDictionary<string, IReadOnlyList<string>> values) => _values = values;

  /// <summary>Builds bindings from a <c>name → scalar</c> map.</summary>
  /// <param name="values">The scalar variable values.</param>
  /// <returns>The bindings.</returns>
  public static UriTemplateValues FromScalars(IReadOnlyDictionary<string, string> values)
  {
    ArgumentNullException.ThrowIfNull(values);
    var map = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
    foreach (var (key, value) in values)
    {
      map[key] = [value];
    }

    return new UriTemplateValues(map);
  }

  /// <summary>Builds bindings from a <c>name → list</c> map (each list value participates in explode expansion).</summary>
  /// <param name="values">The list-valued variable values.</param>
  /// <returns>The bindings.</returns>
  public static UriTemplateValues FromLists(IReadOnlyDictionary<string, IReadOnlyList<string>> values)
  {
    ArgumentNullException.ThrowIfNull(values);
    return new UriTemplateValues(new Dictionary<string, IReadOnlyList<string>>(values, StringComparer.Ordinal));
  }

  /// <summary>Resolves the (possibly multi-valued) binding for <paramref name="name"/>.</summary>
  /// <param name="name">The variable name.</param>
  /// <param name="resolved">The bound values when present.</param>
  /// <returns><c>true</c> when the variable is bound.</returns>
  public bool TryGet(string name, out IReadOnlyList<string> resolved)
  {
    if (_values.TryGetValue(name, out var value))
    {
      resolved = value;
      return true;
    }

    resolved = [];
    return false;
  }
}
