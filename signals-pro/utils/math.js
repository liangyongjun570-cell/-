// 轻量数学排版：把迷你 LaTeX 子集解析成可渲染的 token
// 支持：^{} _{} \frac \int \sum \prod \oint \lim \sqrt \text \mathrm \left \right 及常用希腊字母/运算符

const SYM = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ',
  to: '→', rightarrow: '→', longrightarrow: '⟶', leftarrow: '←',
  Rightarrow: '⇒', Leftrightarrow: '⇔', leftrightarrow: '↔', mapsto: '↦',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈',
  equiv: '≡', sim: '∼', propto: '∝', ll: '≪', gg: '≫',
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗', star: '⋆',
  circ: '∘', bullet: '•', oplus: '⊕', otimes: '⊗',
  forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩',
  angle: '∠', perp: '⊥', parallel: '∥', therefore: '∴', because: '∵',
  prime: '′', ldots: '…', cdots: '⋯', dots: '…',
  mathcal_F: 'ℱ', mathcal_L: 'ℒ', mathcal_Z: '𝒵',
  quad: '\u2003', qquad: '\u2003\u2003', space: ' ', ',' : '\u2009', ';': '\u2009',
  R: 'ℝ', N: 'ℕ', Z: 'ℤ', C: 'ℂ',
  int: '∫', iint: '∬', iiint: '∭', oint: '∮', sum: 'Σ', prod: '∏',
  Re: 'Re', Im: 'Im', sgn: 'sgn', Sa: 'Sa',
};

const SUP_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
};
const SUB_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', n: 'ₙ', i: 'ᵢ', k: 'ₖ', p: 'ₚ', s: 'ₛ', t: 'ₜ',
};

function toScript(str, map) {
  let ok = true;
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (map[c]) out += map[c];
    else {
      ok = false;
      break;
    }
  }
  return ok ? out : null;
}

// 把带命令的片段解析成纯文本（用于上下标 / 分式的分子分母）
function resolveText(src) {
  const s = String(src == null ? '' : src);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
      if (m) {
        const cmd = m[1];
        i += m[0].length;
        if (cmd === 'frac') {
          const a = readGroup(s, i);
          i = a.next;
          const b = readGroup(s, i);
          i = b.next;
          out += resolveText(a.text) + '/' + resolveText(b.text);
          continue;
        }
        if (cmd === 'text' || cmd === 'mathrm' || cmd === 'operatorname') {
          const g = readGroup(s, i);
          i = g.next;
          out += g.text;
          continue;
        }
        if (cmd === 'sqrt') {
          const g = readGroup(s, i);
          i = g.next;
          out += '√' + resolveText(g.text);
          continue;
        }
        if (cmd === 'mathcal') {
          const g = readGroup(s, i);
          i = g.next;
          out += g.text === 'F' ? 'ℱ' : g.text === 'L' ? 'ℒ' : g.text === 'Z' ? '𝒵' : g.text;
          continue;
        }
        if (cmd === 'left' || cmd === 'right') continue;
        if (cmd === 'int' || cmd === 'sum' || cmd === 'prod' || cmd === 'oint') {
          out += SYM[cmd];
          continue;
        }
        if (SYM[cmd] != null) {
          out += SYM[cmd];
        } else {
          out += cmd;
        }
        continue;
      }
      const nxt = s[i + 1] || '';
      if (nxt === ',' || nxt === ';') {
        out += '\u2009';
        i += 2;
        continue;
      }
      if (nxt === '{' || nxt === '}') {
        out += nxt;
        i += 2;
        continue;
      }
      out += nxt;
      i += 2;
      continue;
    }
    if (ch === '^') {
      const g = readGroup(s, i + 1);
      i = g.next;
      const inner = resolveText(g.text);
      const up = toScript(inner, SUP_MAP);
      out += up != null ? up : '(' + inner + ')';
      continue;
    }
    if (ch === '_') {
      const g = readGroup(s, i + 1);
      i = g.next;
      const inner = resolveText(g.text);
      const low = toScript(inner, SUB_MAP);
      out += low != null ? low : '(' + inner + ')';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function readGroup(s, i) {
  if (s[i] !== '{') {
    // 单个字符
    if (i >= s.length) return { text: '', next: i };
    return { text: s[i], next: i + 1 };
  }
  let level = 0;
  const start = i;
  for (; i < s.length; i++) {
    if (s[i] === '{') level++;
    else if (s[i] === '}') {
      level--;
      if (level === 0) return { text: s.slice(start + 1, i), next: i + 1 };
    }
  }
  return { text: s.slice(start + 1), next: s.length };
}

function parse(src) {
  const s = String(src == null ? '' : src);
  const out = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) {
      out.push({ t: 't', v: buf });
      buf = '';
    }
  };

  while (i < s.length) {
    const ch = s[i];

    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
      if (m) {
        const cmd = m[1];
        i += m[0].length;

        if (cmd === 'frac') {
          const a = readGroup(s, i);
          i = a.next;
          const b = readGroup(s, i);
          i = b.next;
          flush();
          out.push({ t: 'frac', num: resolveText(a.text), den: resolveText(b.text) });
          continue;
        }
        if (cmd === 'int' || cmd === 'sum' || cmd === 'prod' || cmd === 'oint' || cmd === 'iint') {
          flush();
          const node = { t: 'big', v: SYM[cmd], sub: '', sup: '' };
          for (let k = 0; k < 2; k++) {
            if (s[i] === '_') {
              const g = readGroup(s, i + 1);
              i = g.next;
              node.sub = resolveText(g.text);
            } else if (s[i] === '^') {
              const g = readGroup(s, i + 1);
              i = g.next;
              node.sup = resolveText(g.text);
            } else break;
          }
          out.push(node);
          continue;
        }
        if (cmd === 'lim') {
          flush();
          const node = { t: 'lim', v: 'lim', sub: '' };
          if (s[i] === '_') {
            const g = readGroup(s, i + 1);
            i = g.next;
            node.sub = resolveText(g.text);
          }
          out.push(node);
          continue;
        }
        if (cmd === 'sqrt') {
          const g = readGroup(s, i);
          i = g.next;
          flush();
          out.push({ t: 'sqrt', v: resolveText(g.text) });
          continue;
        }
        if (cmd === 'text' || cmd === 'mathrm' || cmd === 'operatorname') {
          const g = readGroup(s, i);
          i = g.next;
          buf += g.text;
          continue;
        }
        if (cmd === 'mathcal') {
          const g = readGroup(s, i);
          i = g.next;
          buf += g.text === 'F' ? 'ℱ' : g.text === 'L' ? 'ℒ' : g.text === 'Z' ? '𝒵' : g.text;
          continue;
        }
        if (cmd === 'left' || cmd === 'right') {
          // 紧随其后的定界符照常输出
          continue;
        }
        if (SYM[cmd] != null) {
          buf += SYM[cmd];
        } else {
          buf += cmd;
        }
        continue;
      }
      // 转义的普通字符
      const nxt = s[i + 1] || '';
      if (nxt === ',' || nxt === ';') {
        buf += '\u2009';
        i += 2;
        continue;
      }
      if (nxt === ' ') {
        buf += ' ';
        i += 2;
        continue;
      }
      buf += nxt;
      i += 2;
      continue;
    }

    if (ch === '^') {
      const g = readGroup(s, i + 1);
      i = g.next;
      flush();
      out.push({ t: 'sup', v: resolveText(g.text) });
      continue;
    }
    if (ch === '_') {
      const g = readGroup(s, i + 1);
      i = g.next;
      flush();
      out.push({ t: 'sub', v: resolveText(g.text) });
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

module.exports = { parse, resolveText };
