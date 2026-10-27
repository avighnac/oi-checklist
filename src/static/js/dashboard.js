function areNotesEnabled() {
  return (localStorage.getItem('notesEnabled') ?? 'true') === 'true';
}
function renderMarkdownPreview(text) {
  const preview = document.getElementById('md-preview');
  if (!preview) return;
  const lines = (text || '').replace(/\r/g, '').split('\n');
  let html = '';
  let inUl = false,
    inOl = false,
    inFence = false,
    fenceLines = [];
  const flushFence = () => {
    html += `<pre><code>${mdEscape(fenceLines.join('\n'))}</code></pre>`;
    fenceLines = [];
  };
  for (const raw of lines) {
    const fenceMatch = raw.match(/^```(.*)\s*$/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        continue;
      } else {
        flushFence();
        inFence = false;
        continue;
      }
    }
    if (inFence) {
      fenceLines.push(raw);
      continue;
    }
    let block = mdBlockRender(raw);
    if (block.startsWith('<li>')) {
      const isOrdered = /^\d+\.\s+/.test(raw);
      if (isOrdered) {
        if (!inOl) {
          if (inUl) {
            html += '</ul>';
            inUl = false;
          }
          html += '<ol>';
          inOl = true;
        }
      } else {
        if (!inUl) {
          if (inOl) {
            html += '</ol>';
            inOl = false;
          }
          html += '<ul>';
          inUl = true;
        }
      }
      html += block;
    } else {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      if (inOl) {
        html += '</ol>';
        inOl = false;
      }
      html += block;
    }
  }
  if (inUl) html += '</ul>';
  if (inOl) html += '</ol>';
  if (inFence) flushFence();
  preview.innerHTML = html || '<p><em>No content</em></p>';
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([preview]);
  }
}
function sumTextBefore(node, stopAt) {
  let sum = 0;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    if (n === stopAt) break;
    sum += n.nodeValue.length;
  }
  return sum;
}
function caretRangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const pos = document.caretPositionFromPoint
    ? document.caretPositionFromPoint(x, y)
    : null;
  if (pos) {
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }
  return null;
}
function getTextOffsetWithin(div, clientX, clientY) {
  const r = caretRangeFromPoint(clientX, clientY);
  if (!r) return null;
  const anchor = r.startContainer;
  const offset = r.startOffset;
  const base = sumTextBefore(div, anchor);
  return base + offset;
}
let currentCellForNotes = null;
let noteLines = [];
function mdEscape(html) {
  return html.replace(
    /[&<>]/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m],
  );
}
function mdInline(line) {
  line = line.replace(/`([^`]+)`/g, '<code>$1</code>');
  line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  line = line.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  line = line.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );
  return line;
}
function mdBlockRender(raw) {
  const t = raw.trim();
  if (/^######\s+/.test(raw))
    return '<h6>' + mdInline(mdEscape(raw.replace(/^######\s+/, ''))) + '</h6>';
  if (/^#####\s+/.test(raw))
    return '<h5>' + mdInline(mdEscape(raw.replace(/^#####\s+/, ''))) + '</h5>';
  if (/^####\s+/.test(raw))
    return '<h4>' + mdInline(mdEscape(raw.replace(/^####\s+/, ''))) + '</h4>';
  if (/^###\s+/.test(raw))
    return '<h3>' + mdInline(mdEscape(raw.replace(/^###\s+/, ''))) + '</h3>';
  if (/^##\s+/.test(raw))
    return '<h2>' + mdInline(mdEscape(raw.replace(/^##\s+/, ''))) + '</h2>';
  if (/^#\s+/.test(raw))
    return '<h1>' + mdInline(mdEscape(raw.replace(/^#\s+/, ''))) + '</h1>';
  if (/^>\s?/.test(raw))
    return (
      '<blockquote>' +
      mdInline(mdEscape(raw.replace(/^>\s?/, ''))) +
      '</blockquote>'
    );
  if (/^[-*]\s+/.test(raw))
    return '<li>' + mdInline(mdEscape(raw.replace(/^[-*]\s+/, ''))) + '</li>';
  if (/^\d+\.\s+/.test(raw))
    return '<li>' + mdInline(mdEscape(raw.replace(/^\d+\.\s+/, ''))) + '</li>';
  return '<p>' + mdInline(mdEscape(raw)) + '</p>';
}
function renderAllLines() {
  const editor = document.getElementById('md-editor');
  if (!editor) return;
  let html = '';
  let inUl = false,
    inOl = false,
    inFence = false,
    fenceLang = '',
    fenceLines = [],
    fenceStartIndex = -1;
  noteLines.forEach((raw, idx) => {
    const fenceMatch = raw.match(/^```(.*)\s*$/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceLang = fenceMatch[1] || '';
        fenceLines = [];
        fenceStartIndex = idx;
        return;
      } else {
        html += `<div class="md-line" data-index="${fenceStartIndex}"><pre><code>${mdEscape(fenceLines.join('\n'))}</code></pre></div>`;
        inFence = false;
        fenceLang = '';
        fenceLines = [];
        return;
      }
    }
    if (inFence) {
      fenceLines.push(raw);
      return;
    }
    let lineHtml = mdBlockRender(raw);
    if (lineHtml.startsWith('<li>')) {
      const isOrdered = /^\d+\.\s+/.test(raw);
      if (isOrdered) {
        if (!inOl) {
          html += '<ol>';
          inOl = true;
        }
      } else {
        if (!inUl) {
          html += '<ul>';
          inUl = true;
        }
      }
      html += `<div class="md-line" data-index="${idx}">${lineHtml}</div>`;
    } else {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      if (inOl) {
        html += '</ol>';
        inOl = false;
      }
      html += `<div class="md-line" data-index="${idx}">${lineHtml}</div>`;
    }
  });
  if (inUl) html += '</ul>';
  if (inOl) html += '</ol>';
  if (inFence) {
    html += `<div class="md-line" data-index="${fenceStartIndex}"><pre><code>${mdEscape(fenceLines.join('\n'))}</code></pre></div>`;
  }
  editor.innerHTML =
    html ||
    '<div class="md-line" data-index="0"><p><em>Start typing\u2026</em></p></div>';
  editor.querySelectorAll('.md-line').forEach((div) => {
    div.addEventListener('click', (e) => {
      const off = getTextOffsetWithin(div, e.clientX, e.clientY);
      startEditingLine(parseInt(div.dataset.index, 10), off);
      e.stopPropagation();
    });
  });
  editor.addEventListener(
    'click',
    (e) => {
      if (e.target === editor) {
        if (!noteLines.length) noteLines = [''];
        renderAllLines();
        startEditingLine(noteLines.length - 1);
      }
    },
    { once: true },
  );
}
function startEditingLine(i, caretAt = null) {
  const editor = document.getElementById('md-editor');
  const lineDivs = editor.querySelectorAll('.md-line');
  const div = [...lineDivs].find((d) => parseInt(d.dataset.index, 10) === i);
  if (!div) return;
  let fenceStart = i;
  let fenceEnd = i;
  if (/^```/.test(noteLines[i])) {
    fenceStart = i;
    fenceEnd = i + 1;
    while (fenceEnd < noteLines.length && !/^```/.test(noteLines[fenceEnd]))
      fenceEnd++;
    if (fenceEnd < noteLines.length) {
      const fenceRaw = noteLines.slice(fenceStart, fenceEnd + 1).join('\n');
      div.classList.add('editing');
      div.setAttribute('contenteditable', 'true');
      div.innerText = fenceRaw;
      const commit2 = () => {
        const pieces = div.innerText.replace(/\r/g, '').split('\n');
        noteLines.splice(fenceStart, fenceEnd - fenceStart + 1, ...pieces);
        div.removeAttribute('contenteditable');
        div.classList.remove('editing');
        renderAllLines();
      };
      div.addEventListener('blur', commit2, { once: true });
      div.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') {
          e.preventDefault();
          commit2();
        }
      });
      if (caretAt != null) {
        const range = document.createRange();
        range.selectNodeContents(div.firstChild || div);
        let pos = Math.max(0, Math.min(caretAt, div.innerText.length));
        const sel = window.getSelection();
        sel.removeAllRanges();
        let remaining = pos;
        const walker = document.createTreeWalker(
          div,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let n;
        while ((n = walker.nextNode())) {
          if (remaining <= n.nodeValue.length) {
            range.setStart(n, remaining);
            break;
          }
          remaining -= n.nodeValue.length;
        }
        if (!n) range.setStart(div, div.childNodes.length);
        range.collapse(true);
        sel.addRange(range);
      } else {
        placeCaretAtEnd(div);
      }
      return;
    }
  }
  div.classList.add('editing');
  div.setAttribute('contenteditable', 'true');
  let editingText = noteLines[i] || '';
  div.innerText = editingText;
  if (caretAt != null) {
    const range = document.createRange();
    range.selectNodeContents(div.firstChild || div);
    let pos = Math.max(0, Math.min(caretAt, div.innerText.length));
    const sel = window.getSelection();
    sel.removeAllRanges();
    let remaining = pos;
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      if (remaining <= n.nodeValue.length) {
        range.setStart(n, remaining);
        break;
      }
      remaining -= n.nodeValue.length;
    }
    if (!n) range.setStart(div, div.childNodes.length);
    range.collapse(true);
    sel.addRange(range);
  } else {
    placeCaretAtEnd(div);
  }
  const commit = () => {
    noteLines[i] = div.innerText.replace(/\r/g, '');
    div.removeAttribute('contenteditable');
    div.classList.remove('editing');
    renderAllLines();
  };
  div.addEventListener('blur', commit, { once: true });
  div.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'Enter') {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = div.innerText;
      const caretPos = getCaretCharacterOffsetWithin(div);
      const left = text.slice(0, caretPos);
      const right = text.slice(caretPos);
      noteLines[i] = left;
      noteLines.splice(i + 1, 0, right);
      renderAllLines();
      startEditingLine(i + 1);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
  });
}
function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
function getCaretCharacterOffsetWithin(element) {
  let caretOffset = 0;
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.endContainer, range.endOffset);
    caretOffset = preRange.toString().length;
  }
  return caretOffset;
}
function applyInlineFormat(kind) {
  const ta = document.getElementById('md-textarea');
  if (!ta) return;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  const before = ta.value.slice(0, start);
  const sel = ta.value.slice(start, end);
  const after = ta.value.slice(end);
  const wrap = (left, right) => {
    const newSel = sel || (kind === 'link' ? 'text' : '');
    const inserted = left + newSel + right;
    ta.value = before + inserted + after;
    const caretStart = before.length + left.length;
    const caretEnd = caretStart + newSel.length;
    ta.focus();
    ta.setSelectionRange(caretStart, caretEnd);
  };
  if (kind === 'bold') return wrap('**', '**');
  if (kind === 'italic') return wrap('*', '*');
  if (kind === 'code') return wrap('`', '`');
  if (kind === 'link') return wrap('[', '](https://example.com)');
}
function openNoteEditor(cell) {
  if (!areNotesEnabled()) return;
  if (!cell) return;
  const overlay = document.getElementById('note-overlay');
  const id = Number.parseInt(cell.dataset.id, 10);
  if (!Number.isFinite(id)) return;
  const entry = getProblemEntry(id);
  const raw =
    typeof entry?.problem?.note === 'string' ? entry.problem.note : '';
  document.getElementById('note-raw').value = raw;
  const ta = document.getElementById('md-textarea');
  if (ta) ta.value = raw;
  noteLines = raw ? raw.split('\n') : [''];
  renderAllLines();
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
  const hidden = document.getElementById('note-raw');
  hidden.dataset.problemId = String(id);
}
function closeNoteEditor() {
  const overlay = document.getElementById('note-overlay');
  overlay.classList.remove('active');
  setTimeout(() => (overlay.style.display = 'none'), 150);
}
function refreshNoteIconState() {
  if (!areNotesEnabled()) return;
  const btn = document.getElementById('note-button');
  const cell = currentCellForNotes;
  if (!btn || !cell) return;
  const id = Number.parseInt(cell.dataset.id, 10);
  if (!Number.isFinite(id)) {
    btn.classList.remove('has-note');
    return;
  }
  const entry = getProblemEntry(id);
  const note = entry?.problem?.note ?? '';
  btn.classList.toggle(
    'has-note',
    typeof note === 'string' && note.trim().length > 0,
  );
}
(function () {
  const btn = document.getElementById('note-button');
  const overlay = document.getElementById('note-overlay');
  const closeBtn = document.getElementById('note-close');
  const saveBtn = document.getElementById('note-save');
  const ta = document.getElementById('md-textarea');
  const pv = document.getElementById('md-preview');
  const toggleBtn = document.getElementById('md-toggle');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openNoteEditor(currentCellForNotes);
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeNoteEditor);
  }
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeNoteEditor();
    });
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const hidden = document.getElementById('note-raw');
      const id = Number.parseInt(hidden.dataset.problemId, 10);
      if (!Number.isFinite(id)) return;
      const ta2 = document.getElementById('md-textarea');
      const markdown = ta2 ? ta2.value : '';
      const sessionToken = localStorage.getItem('sessionToken');
      await fetch(apiUrl + '/user/problems', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: sessionToken, id, note: markdown }),
      });
      const entry = getProblemEntry(id);
      if (entry?.problem) {
        entry.problem.note = markdown;
      }
      closeNoteEditor();
      const btn2 = document.getElementById('note-button');
      if (btn2) {
        btn2.classList.toggle('has-note', markdown.trim().length > 0);
      }
    });
  }
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const mode = toggleBtn.dataset.mode || 'edit';
      if (mode === 'edit') {
        renderMarkdownPreview(ta ? ta.value : '');
        if (ta) ta.style.display = 'none';
        if (pv) pv.style.display = 'block';
        toggleBtn.dataset.mode = 'preview';
        toggleBtn.title = 'Edit (Ctrl/Cmd+/)';
      } else {
        if (pv) pv.style.display = 'none';
        if (ta) ta.style.display = 'block';
        if (ta) ta.focus();
        toggleBtn.dataset.mode = 'edit';
        toggleBtn.title = 'Preview (Ctrl/Cmd+/)';
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNoteEditor();
  });
})();
document.addEventListener('DOMContentLoaded', () => {
  const bar = document.querySelector('.md-toolbar');
  if (!bar) return;
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('.md-btn');
    if (!b) return;
    const kind = b.dataset.md;
    applyInlineFormat(kind);
  });
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key.toLowerCase() === 'b') {
      e.preventDefault();
      applyInlineFormat('bold');
    }
    if (e.key.toLowerCase() === 'i') {
      e.preventDefault();
      applyInlineFormat('italic');
    }
    if (e.key.toLowerCase() === 'e') {
      e.preventDefault();
      applyInlineFormat('code');
    }
    if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      applyInlineFormat('link');
    }
    if (e.key === '/') {
      e.preventDefault();
      const btn = document.getElementById('md-toggle');
      if (btn) btn.click();
    }
  });
});
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('note-button');
  if (btn && !areNotesEnabled()) {
    btn.style.display = 'none';
  }
});
const count = {
  counts: { red: 0, yellow: 0, green: 0, white: 0 },
  sectionCounts: {},
  // Track counts per section
  update(key, diff) {
    if (key in this.counts) {
      this.counts[key] += diff;
      const el = document.getElementById(`${key}-count`);
      if (el) el.textContent = this.counts[key];
      let total = 0;
      for (const color in this.counts) {
        total += this.counts[color];
      }
      if (total > 0) {
        for (const color in this.counts) {
          const el2 = document.querySelector(`.progress-segment.${color}`);
          if (el2) {
            el2.style.width = `${(this.counts[color] / total) * 100}%`;
          }
        }
      } else {
        for (const color in this.counts) {
          const el2 = document.querySelector(`.progress-segment.${color}`);
          if (el2) {
            el2.style.width = color === 'white' ? '100%' : '0%';
          }
        }
      }
    }
  },
  updateSection(sectionId, key, diff) {
    if (!this.sectionCounts[sectionId]) {
      this.sectionCounts[sectionId] = { red: 0, yellow: 0, green: 0, white: 0 };
    }
    if (key in this.sectionCounts[sectionId]) {
      this.sectionCounts[sectionId][key] += diff;
      let sectionTotal = 0;
      for (const color in this.sectionCounts[sectionId]) {
        sectionTotal += this.sectionCounts[sectionId][color];
      }
      if (sectionTotal > 0) {
        for (const color in this.sectionCounts[sectionId]) {
          const el = document.querySelector(
            `#${sectionId}-container .section-progress-bar .progress-segment.${color}`,
          );
          if (el) {
            el.style.width = `${(this.sectionCounts[sectionId][color] / sectionTotal) * 100}%`;
          }
        }
      } else {
        for (const color in this.sectionCounts[sectionId]) {
          const el = document.querySelector(
            `#${sectionId}-container .section-progress-bar .progress-segment.${color}`,
          );
          if (el) {
            el.style.width = '0%';
          }
        }
      }
    }
  },
};
function createOlympiadContainer(olympiadId) {
  const container = document.createElement('div');
  container.className = 'table-container';
  container.id = `${olympiadId.toLowerCase()}-container`;
  if (olympiadId === 'USACO') {
    container.innerHTML = `
      <div class="usaco-header">
        <h2>${getFullOlympiadName(olympiadId)}</h2>
        <div class="usaco-tab-buttons" style="display: none;">
          <button data-tab="usacoplatinum" class="usaco-tab platinum">Platinum</button>
          <button data-tab="usacogold" class="usaco-tab gold">Gold</button>
          <button data-tab="usacosilver" class="usaco-tab silver">Silver</button>
          <button data-tab="usacobronze" class="usaco-tab bronze">Bronze</button>
        </div>
      </div>
      <div class="section-progress-bar">
        <div class="progress-segment red"></div>
        <div class="progress-segment yellow"></div>
        <div class="progress-segment green"></div>
        <div class="progress-segment white"></div>
      </div>
      <div id="usacoplatinum-container" class="usaco-tab-content">
        <table class="problem-table"></table>
      </div>
      <div id="usacogold-container" class="usaco-tab-content hidden">
        <table class="problem-table"></table>
      </div>
      <div id="usacosilver-container" class="usaco-tab-content hidden">
        <table class="problem-table"></table>
      </div>
      <div id="usacobronze-container" class="usaco-tab-content hidden">
        <table class="problem-table"></table>
      </div>
    `;
    setTimeout(() => {
      container.querySelectorAll('.usaco-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab;
          container.querySelectorAll('.usaco-tab-content').forEach((el) => {
            el.classList.add('hidden');
          });
          document
            .getElementById(`${tab}-container`)
            .classList.remove('hidden');
        });
      });
    }, 0);
  } else {
    const h2 = document.createElement('h2');
    h2.textContent = getFullOlympiadName(olympiadId);
    h2.style.visibility = 'hidden';
    const progressBar = document.createElement('div');
    progressBar.className = 'section-progress-bar';
    progressBar.innerHTML = `
      <div class="progress-segment red"></div>
      <div class="progress-segment yellow"></div>
      <div class="progress-segment green"></div>
      <div class="progress-segment white"></div>
    `;
    const table = document.createElement('table');
    table.className = 'problem-table';
    table.innerHTML = generateSkeletonRows(10);
    container.appendChild(h2);
    container.appendChild(progressBar);
    container.appendChild(table);
  }
  return container;
}
document.querySelectorAll('.problem-cell').forEach((cell) => {
  const name = cell.dataset.problemId?.trim();
  const source = cell.dataset.source?.trim();
  const year = cell.dataset.year?.trim();
  if (!name || !source || !year) return;
  let statusIndex = Number.parseInt(cell.dataset.status ?? '0', 10);
  if (
    !Number.isFinite(statusIndex) ||
    statusIndex < 0 ||
    statusIndex >= statuses.length
  ) {
    statusIndex = 0;
    cell.dataset.status = '0';
  }
  const statusObj = statuses[statusIndex];
  if (statusObj?.className) {
    count.update(statusObj.className, 1);
  }
  if (statusObj?.className && statusObj.className !== 'white') {
    cell.classList.add(statusObj.className);
  }
  cell.addEventListener('click', (e) => {
    if (areNotesEnabled()) {
      currentCellForNotes = cell;
      refreshNoteIconState();
    }
    handleCellClick(cell, name, source, year, e);
  });
});
function updateStatusWithCount(status, cell, name, source, year) {
  const sessionToken = localStorage.getItem('sessionToken');
  const statusObj = statuses[status] ?? statuses[0];
  const id = Number.parseInt(cell.dataset.id, 10);
  if (!Number.isFinite(id)) return;
  const oldStatusIndex = Number.parseInt(cell.dataset.status ?? '0', 10);
  const oldStatus = Number.isFinite(oldStatusIndex)
    ? statuses[oldStatusIndex]
    : statuses[0];
  if (oldStatus?.className) count.update(oldStatus.className, -1);
  updateStatus(status, cell, name, source, year);
  if (statusObj?.className) count.update(statusObj.className, 1);
  fetch(apiUrl + '/user/problems', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: sessionToken, id, status }),
  });
}
function handlePopupCloseWithServer(cell) {
  if (isProfileMode) return;
  const score = parseFloat(cell.dataset.score) || 0;
  let status = Number.parseInt(cell.dataset.status ?? '0', 10);
  if (!Number.isFinite(status)) status = 0;
  const name = cell.dataset.problemId;
  const source = cell.dataset.source;
  const year = parseInt(cell.dataset.year);
  const id = Number.parseInt(cell.dataset.id, 10);
  if (!Number.isFinite(id)) return;
  handlePopupClose(cell);
  if (status === 2 || status === 0) {
    const finalScore = status === 2 ? 100 : 0;
    if (Math.abs(parseFloat(cell.dataset.score) - finalScore) < 1e-3) {
      return;
    }
    const sessionToken = localStorage.getItem('sessionToken');
    fetch(apiUrl + '/user/problems', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: sessionToken, id, score: finalScore }),
    });
  }
}
let cachedProblemsData = null;
let problemLookup = /* @__PURE__ */ new Map();
function buildProblemLookup() {
  problemLookup = /* @__PURE__ */ new Map();
  if (!cachedProblemsData) return;
  for (const [sourceKey, yearMap] of Object.entries(cachedProblemsData)) {
    if (!yearMap) continue;
    for (const [yearKey, problems] of Object.entries(yearMap)) {
      if (!Array.isArray(problems)) continue;
      problems.forEach((problem) => {
        if (!problem) return;
        const problemId = Number(problem.id);
        if (!Number.isFinite(problemId)) return;
        const normalizedSource = problem.source ?? sourceKey;
        problem.source = normalizedSource;
        const normalizedStatus = Number.isFinite(problem.status)
          ? problem.status
          : 0;
        const normalizedScore = Number.isFinite(problem.score)
          ? problem.score
          : 0;
        problem.status = normalizedStatus;
        problem.score = normalizedScore;
        if (typeof problem.note !== 'string') {
          problem.note = '';
        }
        const normalizedYear = Number.isFinite(Number(yearKey))
          ? Number(yearKey)
          : yearKey;
        problemLookup.set(problemId, {
          source: normalizedSource,
          year: normalizedYear,
          problem,
        });
      });
    }
  }
}
function getProblemEntry(id) {
  if (id == null) return void 0;
  const numericId = typeof id === 'string' ? Number.parseInt(id, 10) : id;
  if (!Number.isFinite(numericId)) return void 0;
  return problemLookup.get(numericId);
}
async function loadProblems(from) {
  const yearMap = cachedProblemsData[from] || {};
  const container = document.getElementById(`${from.toLowerCase()}-container`);
  const table = container.querySelector('table');
  table.innerHTML = '';
  const tbody = document.createElement('tbody');
  const monthOrder = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12,
    'First Contest': 13,
    'Second Contest': 14,
    'Third Contest': 15,
    Open: 16,
  };
  const sortedYears = Object.keys(yearMap).sort((a, b) => {
    return yearSortOrder === 'asc' ? a - b : b - a;
  });
  for (const year of sortedYears) {
    const problems = yearMap[year];
    let prefix = from;
    let was_joioc = false;
    if (prefix === 'JOIFR' || prefix === 'JOIOC') {
      if (prefix === 'JOIOC') {
        was_joioc = true;
      }
      prefix = 'JOI';
    } else if (
      prefix === 'NOIPRELIM' ||
      prefix === 'NOIQUAL' ||
      prefix === 'NOIFINAL' ||
      prefix === 'NOISEL'
    ) {
      prefix = 'NOI';
    }
    const isUsaco = prefix.startsWith('USACO');
    if (isUsaco) {
      if (prefix === 'USACOGOLD') {
        prefix = 'Gold';
      } else if (prefix === 'USACOSILVER') {
        prefix = 'Silver';
      } else if (prefix === 'USACOBRONZE') {
        prefix = 'Bronze';
      } else {
        prefix = 'Platinum';
      }
    }
    const isGroupedByExtra =
      prefix === 'GKS' ||
      isUsaco ||
      was_joioc ||
      prefix === 'EJOI' ||
      prefix === 'IZHO' ||
      prefix === 'ROI' ||
      prefix === 'BKOI' ||
      prefix === 'IOI' ||
      prefix === 'BOI' ||
      prefix === 'POI' ||
      prefix === 'CEOI' ||
      prefix === 'CNOI' ||
      prefix === 'COCI' ||
      prefix === 'RMI';
    if (isGroupedByExtra) {
      const yearRow = document.createElement('tr');
      const yearCell = document.createElement('td');
      yearCell.className = 'year-cell';
      yearCell.textContent = `${prefix} ${year}`;
      yearRow.appendChild(yearCell);
      tbody.appendChild(yearRow);
      const extraMap = {};
      for (const problem of problems) {
        const key = problem.extra || 'No Extra';
        if (!extraMap[key]) extraMap[key] = [];
        extraMap[key].push(problem);
      }
      const sortedExtras = Object.keys(extraMap).sort((a, b) => {
        const dayRegex = /^Day\s+(\d+)$/;
        const matchA = a.match(dayRegex);
        const matchB = b.match(dayRegex);
        if (matchA && matchB) {
          return parseInt(matchA[1]) - parseInt(matchB[1]);
        }
        const orderA = monthOrder[a] || 99;
        const orderB = monthOrder[b] || 99;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.localeCompare(b);
      });
      for (const extra of sortedExtras) {
        if (extra === 'No Extra') {
          for (const problem of extraMap[extra]) {
            const cell = document.createElement('td');
            cell.className = 'problem-cell';
            const statusValue = Number.isFinite(problem.status)
              ? problem.status
              : 0;
            const status = statuses.find((s) => s.value === statusValue);
            if (status?.className) {
              cell.classList.add(status.className);
              count.update(status.className, 1);
              count.updateSection(from.toLowerCase(), status.className, 1);
              if (from.startsWith('USACO')) {
                count.updateSection('usaco', status.className, 1);
              }
            }
            const scoreValue = Number.isFinite(problem.score)
              ? problem.score
              : 0;
            cell.dataset.id = String(problem.id);
            cell.dataset.status = String(statusValue);
            cell.dataset.problemId = problem.name;
            cell.dataset.source = problem.source ?? from;
            cell.dataset.year = problem.year;
            cell.dataset.score = String(scoreValue);
            const link = document.createElement('a');
            link.href = problem.link;
            link.target = '_blank';
            link.textContent = problem.name;
            link.addEventListener('click', (e) => e.stopPropagation());
            cell.appendChild(link);
            cell.addEventListener('click', (e) => {
              if (areNotesEnabled()) {
                currentCellForNotes = cell;
                refreshNoteIconState();
              }
              handleCellClick(cell, problem.name, from, problem.year, e);
            });
            yearRow.appendChild(cell);
          }
        } else {
          let extraRow = document.createElement('tr');
          const extraCell = document.createElement('td');
          extraCell.className = 'day-cell';
          extraCell.textContent = extra;
          const dayProblems = extraMap[extra];
          const rowSize = from === 'IOI'
            ? (dayProblems.length === 4 ? 2 : 3)
            : dayProblems.length;
          extraCell.rowSpan = Math.ceil(dayProblems.length / rowSize);
          extraRow.appendChild(extraCell);
          for (const [index, problem] of dayProblems.entries()) {
            if (index > 0 && index % rowSize === 0) {
              tbody.appendChild(extraRow);
              extraRow = document.createElement('tr');
            }
            const cell = document.createElement('td');
            cell.className = 'problem-cell';
            if (from === 'IOI') {
              const rowStart = Math.floor(index / rowSize) * rowSize;
              cell.colSpan = 6 / Math.min(rowSize, dayProblems.length - rowStart);
            }
            const statusValue = Number.isFinite(problem.status)
              ? problem.status
              : 0;
            const status = statuses.find((s) => s.value === statusValue);
            if (status?.className) {
              cell.classList.add(status.className);
              count.update(status.className, 1);
              count.updateSection(from.toLowerCase(), status.className, 1);
              if (from.startsWith('USACO')) {
                count.updateSection('usaco', status.className, 1);
              }
            }
            const scoreValue = Number.isFinite(problem.score)
              ? problem.score
              : 0;
            cell.dataset.id = String(problem.id);
            cell.dataset.status = String(statusValue);
            cell.dataset.problemId = problem.name;
            cell.dataset.source = problem.source ?? from;
            cell.dataset.year = problem.year;
            cell.dataset.score = String(scoreValue);
            const link = document.createElement('a');
            link.href = problem.link;
            link.target = '_blank';
            link.textContent = problem.name;
            link.addEventListener('click', (e) => e.stopPropagation());
            cell.appendChild(link);
            cell.addEventListener('click', (e) => {
              if (areNotesEnabled()) {
                currentCellForNotes = cell;
                refreshNoteIconState();
              }
              handleCellClick(cell, problem.name, from, problem.year, e);
            });
            extraRow.appendChild(cell);
          }
          tbody.appendChild(extraRow);
        }
      }
    } else {
      const row = document.createElement('tr');
      const yearCell = document.createElement('td');
      yearCell.className = 'year-cell';
      yearCell.textContent = `${prefix} ${year}`;
      row.appendChild(yearCell);
      for (const problem of problems) {
        const cell = document.createElement('td');
        cell.className = 'problem-cell';
        const statusValue = Number.isFinite(problem.status)
          ? problem.status
          : 0;
        const status = statuses.find((s) => s.value === statusValue);
        if (status?.className) {
          cell.classList.add(status.className);
          count.update(status.className, 1);
          count.updateSection(from.toLowerCase(), status.className, 1);
          if (from.startsWith('USACO')) {
            count.updateSection('usaco', status.className, 1);
          }
        }
        const scoreValue = Number.isFinite(problem.score) ? problem.score : 0;
        cell.dataset.id = String(problem.id);
        cell.dataset.status = String(statusValue);
        cell.dataset.problemId = problem.name;
        cell.dataset.source = problem.source ?? from;
        cell.dataset.year = problem.year;
        cell.dataset.score = String(scoreValue);
        const link = document.createElement('a');
        link.href = problem.link;
        link.target = '_blank';
        link.textContent = problem.name;
        link.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        cell.appendChild(link);
        cell.addEventListener('click', (e) => {
          if (areNotesEnabled()) {
            currentCellForNotes = cell;
            refreshNoteIconState();
          }
          handleCellClick(cell, problem.name, from, problem.year, e);
        });
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
  }
  table.appendChild(tbody);
}
function loadProblemsWithDay(source, numDays, problemsPerDay = 3) {
  const yearMap = cachedProblemsData[source] || {};
  const container = document.getElementById(
    `${source.toLowerCase()}-container`,
  );
  const table = container.querySelector('table');
  table.innerHTML = '';
  const tbody = document.createElement('tbody');
  const sortedYears = Object.keys(yearMap).sort((a, b) => {
    return yearSortOrder === 'asc' ? a - b : b - a;
  });
  for (const year of sortedYears) {
    const problems = yearMap[year];
    const yearRow = document.createElement('tr');
    const yearCell = document.createElement('td');
    yearCell.className = 'year-cell';
    yearCell.textContent = `${source} ${year}`;
    yearRow.appendChild(yearCell);
    tbody.appendChild(yearRow);
    const problemMap = {};
    for (const problem of problems) {
      problemMap[problem.number] = problem;
    }
    for (let day = 0; day < numDays; day++) {
      const dayRow = document.createElement('tr');
      const dayCell = document.createElement('td');
      dayCell.className = 'day-cell';
      dayCell.textContent = `Day ${day + 1}`;
      dayRow.appendChild(dayCell);
      for (let i = 1; i <= problemsPerDay; i++) {
        const problemIndex = day * problemsPerDay + i;
        const problem = problemMap[problemIndex];
        const cell = document.createElement('td');
        cell.className = 'problem-cell';
        if (problem) {
          const statusValue = Number.isFinite(problem.status)
            ? problem.status
            : 0;
          const status = statuses.find((s) => s.value === statusValue);
          if (status?.className) {
            cell.classList.add(status.className);
            count.update(status.className, 1);
            count.updateSection(source.toLowerCase(), status.className, 1);
            if (source.startsWith('USACO')) {
              count.updateSection('usaco', status.className, 1);
            }
          }
          const scoreValue = Number.isFinite(problem.score) ? problem.score : 0;
          cell.dataset.id = String(problem.id);
          cell.dataset.status = String(statusValue);
          cell.dataset.problemId = problem.name;
          cell.dataset.source = problem.source ?? source;
          cell.dataset.year = problem.year;
          cell.dataset.score = String(scoreValue);
          const link = document.createElement('a');
          link.href = problem.link;
          link.target = '_blank';
          link.textContent = problem.name;
          link.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          cell.appendChild(link);
          cell.addEventListener('click', (e) => {
            if (areNotesEnabled()) {
              currentCellForNotes = cell;
              refreshNoteIconState();
            }
            handleCellClick(cell, problem.name, source, problem.year, e);
          });
        } else {
          cell.classList.add('empty');
        }
        dayRow.appendChild(cell);
      }
      const hasProblem = [...dayRow.children].some(
        (td) => td.classList.contains('problem-cell') && td.children.length > 0,
      );
      if (hasProblem) {
        tbody.appendChild(dayRow);
      }
    }
  }
  table.appendChild(tbody);
}
function displayEmptyStateMessage() {
  const olympiadList = document.getElementById('olympiad-list');
  olympiadList.innerHTML = `
    <div class="empty-state">
      <h3>No olympiads to display</h3>
      <p>It looks like you don't have any olympiads configured to show on your checklist.</p>
      <p>You can configure which olympiads to display in your settings.</p>
    </div>
  `;
}
document.addEventListener('DOMContentLoaded', async () => {
  const sessionToken = localStorage.getItem('sessionToken');
  const fullPath = window.location.pathname;
  const basePath = document.querySelector('base')?.getAttribute('href') || '/';
  const relativePath = fullPath.startsWith(basePath)
    ? fullPath.slice(basePath.length)
    : fullPath;
  const isProfilePage = relativePath.startsWith('checklist/');
  let sources = olympiadIds.flatMap((id) =>
    id === 'USACO'
      ? ['USACOPLATINUM', 'USACOGOLD', 'USACOSILVER', 'USACOBRONZE']
      : id,
  );
  if (!isProfilePage) {
    check_session();
  }
  const username = localStorage.getItem('username');
  const olympiadList = document.getElementById('olympiad-list');
  let usacoSkeletonCreated = false;
  sources.forEach((src) => {
    if (src === 'USACO' || src.startsWith('USACO')) {
      if (!usacoSkeletonCreated) {
        const usacoContainer = createOlympiadContainer('USACO');
        olympiadList.appendChild(usacoContainer);
        usacoSkeletonCreated = true;
      }
    } else {
      const container = createOlympiadContainer(src);
      olympiadList.appendChild(container);
    }
  });
  if (isProfilePage) {
    const uname = relativePath.split('/')[1];
    document.getElementById('page-title').textContent =
      document.title = `${uname}'s OI Checklist`;
  } else {
    document.getElementById('page-title').textContent = `OI Checklist`;
    document.getElementById('welcome-message').textContent =
      `Welcome, ${username}`;
  }
  try {
    let body = { token: sessionToken };
    if (isProfilePage) {
      body['username'] = relativePath.split('/')[1];
    }
    const resp = await fetch(`${apiUrl}/user/settings`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const { olympiadOrder, ascSort, platformPref } = await resp.json();
      if (Array.isArray(olympiadOrder)) {
        sources = olympiadOrder.map((id) => id.toUpperCase());
      }
      if (typeof ascSort === 'boolean') {
        yearSortOrder = ascSort ? 'asc' : 'desc';
      }
      if (Array.isArray(platformPref)) {
        localStorage.setItem('platformPref', JSON.stringify(platformPref));
      }
    } else if (isProfilePage && resp.status === 403) {
      const uname = relativePath.split('/')[1];
      document.body.innerHTML = `<h2 style="text-align:center;margin-top:2em;">
        ${uname}'s checklist is private.
      </h2>`;
      return;
    }
  } catch (err) {
    console.error('Failed to fetch user settings:', err);
  }
  if (sources.length === 0) {
    displayEmptyStateMessage();
    if (isProfilePage) {
      const uname = relativePath.split('/')[1];
      document.getElementById('page-title').textContent =
        document.title = `${uname}'s OI Checklist`;
    } else {
      document.getElementById('page-title').textContent = `OI Checklist`;
      document.getElementById('welcome-message').textContent =
        `Welcome, ${username}`;
    }
    count.update('red', 0);
    count.update('yellow', 0);
    count.update('green', 0);
    count.update('white', 0);
    return;
  }
  if (isProfilePage) {
    document.getElementById('welcome-message').style.display = 'none';
    document.getElementById('logout-button').style.display = 'none';
    document.getElementById('settings-container').style.display = 'none';
    const uname = relativePath.split('/')[1];
    sources = sources.flatMap((src) => {
      if (src === 'USACO') {
        return ['USACOPLATINUM', 'USACOGOLD', 'USACOSILVER', 'USACOBRONZE'];
      }
      return src;
    });
    if (sources.length === 0) {
      return;
    }
    const namesParam = sources.join(',');
    const res = await fetch(`${apiUrl}/user/settings`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname }),
    });
    if (res.status === 404) {
      document.body.innerHTML = `<h2 style="text-align:center;margin-top:2em;">
        Error: user "${uname}" does not exist.
      </h2>`;
      return;
    }
    if (res.status === 403) {
      document.body.innerHTML = `<h2 style="text-align:center;margin-top:2em;">
        ${uname}'s checklist is private.
      </h2>`;
      return;
    }
    if (!res.ok) {
      document.body.innerHTML = `<h2 style="text-align:center;margin-top:2em;">
        Unexpected error (${res.status})
      </h2>`;
      return;
    }
    const profileData = await res.json();
    count.update('red', 0);
    count.update('yellow', 0);
    count.update('green', 0);
    count.update('white', 0);
    isProfileMode = true;
    let problemsPayload = profileData.problems;
    try {
      const probRes = await fetch(`${apiUrl}/data/problems`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: sources.map((i) => i.toLowerCase()),
          username: uname,
        }),
      });
      if (probRes.ok) {
        problemsPayload = await probRes.json();
      }
    } catch (err) {
      console.error('Failed to fetch profile problems data:', err);
    }
    cachedProblemsData = problemsPayload;
    buildProblemLookup();
    sources.forEach((src) => {
      let tbl;
      if (src.startsWith('USACO')) {
        const container = document.getElementById(
          `${src.toLowerCase()}-container`,
        );
        tbl = container?.querySelector('table');
      } else {
        const container = document.getElementById(
          `${src.toLowerCase()}-container`,
        );
        tbl = container?.querySelector('table');
      }
      if (tbl) {
        tbl.innerHTML = '';
        if (src === 'JOISC') loadProblemsWithDay('JOISC', 4);
        else if (src === 'IOITC') loadProblemsWithDay('IOITC', 3);
        else if (src === 'EGOI') loadProblemsWithDay('EGOI', 2, 4);
        else loadProblems(src);
      }
    });
  } else {
    document.getElementById('welcome-message').textContent =
      `Welcome, ${username}`;
    count.update('red', 0);
    count.update('yellow', 0);
    count.update('green', 0);
    count.update('white', 0);
    sources = sources.flatMap((src) => {
      if (src === 'USACO') {
        return ['USACOPLATINUM', 'USACOGOLD', 'USACOSILVER', 'USACOBRONZE'];
      }
      return src;
    });
    if (sources.length === 0) {
      return;
    }
    const res = await fetch(`${apiUrl}/data/problems`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: sessionToken,
        sources: sources.map((i) => i.toLowerCase()),
      }),
    });
    if (!res.ok) return (window.location.href = 'home');
    cachedProblemsData = await res.json();
    buildProblemLookup();
    sources.forEach((src) => {
      let tbl;
      if (src.startsWith('USACO')) {
        const container = document.getElementById(
          `${src.toLowerCase()}-container`,
        );
        tbl = container?.querySelector('table');
      } else {
        const container = document.getElementById(
          `${src.toLowerCase()}-container`,
        );
        tbl = container?.querySelector('table');
      }
      if (tbl) {
        tbl.innerHTML = '';
        if (src === 'JOISC') loadProblemsWithDay('JOISC', 4);
        else if (src === 'IOITC') loadProblemsWithDay('IOITC', 3);
        else if (src === 'EGOI') loadProblemsWithDay('EGOI', 2, 4);
        else loadProblems(src);
      }
    });
  }
  const existingContainers = /* @__PURE__ */ new Map();
  olympiadList.querySelectorAll('.table-container').forEach((container) => {
    const id = container.id.replace('-container', '').toUpperCase();
    existingContainers.set(id, container);
  });
  olympiadList.innerHTML = '';
  let usacoReordered = false;
  sources.forEach((src) => {
    if (src === 'USACO' || src.startsWith('USACO')) {
      if (!usacoReordered) {
        const container = existingContainers.get('USACO');
        if (container) olympiadList.appendChild(container);
        usacoReordered = true;
      }
    } else {
      const container = existingContainers.get(src);
      if (container) olympiadList.appendChild(container);
    }
  });
  document.querySelectorAll('#olympiad-list h2').forEach((h2) => {
    h2.style.visibility = 'visible';
  });
  document.querySelectorAll('.usaco-tab-buttons').forEach((el) => {
    el.style.display = 'flex';
  });
});
document.addEventListener('DOMContentLoaded', function () {
  const settingsButton = document.getElementById('settings-button');
  const settingsContainer = document.getElementById('settings-container');
  const settingsDropdown = document.getElementById('settings-dropdown');
  if (settingsButton && settingsContainer && settingsDropdown) {
    settingsButton.addEventListener('click', function (e) {
      e.stopPropagation();
      settingsContainer.classList.toggle('active');
      settingsButton.setAttribute(
        'aria-expanded',
        settingsContainer.classList.contains('active'),
      );
    });
    document.addEventListener('click', function (e) {
      if (!settingsContainer.contains(e.target)) {
        settingsContainer.classList.remove('active');
        settingsButton.setAttribute('aria-expanded', 'false');
      }
    });
  }
});
(function () {
  const noteBtn = document.getElementById('note-button');
  const noteSave = document.getElementById('note-save');
  const noteClose = document.getElementById('note-close');
  const noteOverlay = document.getElementById('note-overlay');
  if (!areNotesEnabled()) {
    if (noteBtn) noteBtn.style.display = 'none';
  } else {
    if (noteBtn) {
      noteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openNoteEditor(currentCellForNotes);
      });
    }
    if (noteSave) {
      noteSave.addEventListener('click', () => {
        const ta = document.getElementById('note-textarea');
        const key = ta?.dataset.noteKey;
        if (key) {
          localStorage.setItem(key, (ta.value || '').trim());
        }
        closeNoteEditor();
        refreshNoteIconState();
      });
    }
    if (noteClose) {
      noteClose.addEventListener('click', closeNoteEditor);
    }
    if (noteOverlay) {
      noteOverlay.addEventListener('click', (e) => {
        if (e.target === noteOverlay) closeNoteEditor();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && noteOverlay.style.display !== 'none')
          closeNoteEditor();
      });
    }
  }
})();
