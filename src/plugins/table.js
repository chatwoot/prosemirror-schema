import { Plugin, PluginKey } from "prosemirror-state";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  CellSelection,
} from "prosemirror-tables";

// ── Helpers ──

const PLUS_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const GRIP_SVG =
  '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/></svg>';

const isRTL = (el) =>
  getComputedStyle(el || document.documentElement).direction === "rtl";

// ── Table Controls Plugin ──
// + buttons (add row/col at end) + grip handles with dropdown menus

export function tableControlsPlugin(schema) {
  if (!schema.nodes.table) return null;

  let currentTableEl = null;
  let hideTimer = null;
  let editorView = null;

  // + buttons
  let rowBtn = null;
  let colBtn = null;

  // Grip handles
  let rowGrip = null;
  let colGrip = null;
  let hoveredCell = null;

  // Dropdown menu
  let menuEl = null;

  // ── Element factories ──

  const makeAddBtn = (onClick) => {
    const btn = document.createElement("button");
    btn.innerHTML = PLUS_SVG;
    btn.className = "pm-table-add-btn";
    btn.setAttribute("contenteditable", "false");
    btn.style.cssText =
      "position:fixed;z-index:5;border:none;cursor:pointer;" +
      "display:none;align-items:center;justify-content:center;padding:0;" +
      "transition:background .15s,color .15s;";
    btn.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    btn.addEventListener("mouseleave", () => scheduleHide());
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onClick();
    });
    document.body.appendChild(btn);
    return btn;
  };

  const makeGrip = (onClick) => {
    const el = document.createElement("button");
    el.innerHTML = GRIP_SVG;
    el.className = "pm-table-grip";
    el.setAttribute("contenteditable", "false");
    el.style.cssText =
      "position:fixed;z-index:6;border:none;cursor:grab;" +
      "display:none;align-items:center;justify-content:center;padding:0;" +
      "border-radius:3px;transition:background .1s,color .1s;";
    el.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    el.addEventListener("mouseleave", () => {
      if (!menuEl) scheduleHide();
    });
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onClick(el);
    });
    document.body.appendChild(el);
    return el;
  };

  // ── Dropdown menu ──

  const removeMenu = () => {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
  };

  const showMenu = (anchorEl, items) => {
    removeMenu();
    menuEl = document.createElement("div");
    menuEl.className = "pm-table-menu";
    menuEl.style.cssText = "position:fixed;z-index:100;font-family:inherit;";

    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "pm-table-menu-separator";
        menuEl.appendChild(sep);
        return;
      }
      const btn = document.createElement("button");
      btn.textContent = item.label;
      btn.className = "pm-table-menu-item" + (item.danger ? " pm-table-menu-item--danger" : "");
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        removeMenu();
        item.action();
      });
      menuEl.appendChild(btn);
    });

    document.body.appendChild(menuEl);

    // Position below the anchor
    const ar = anchorEl.getBoundingClientRect();
    menuEl.style.left = ar.left + "px";
    menuEl.style.top = ar.bottom + 4 + "px";

    // Keep in viewport
    const mr = menuEl.getBoundingClientRect();
    if (mr.right > window.innerWidth)
      menuEl.style.left = window.innerWidth - mr.width - 8 + "px";
    if (mr.bottom > window.innerHeight)
      menuEl.style.top = ar.top - mr.height - 4 + "px";

    // Close on click outside
    const onClickOutside = (e) => {
      if (menuEl && !menuEl.contains(e.target)) {
        removeMenu();
        document.removeEventListener("mousedown", onClickOutside, true);
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onClickOutside, true);
    }, 0);
  };

  // ── Show / Hide / Position ──

  const ensureElements = () => {
    if (rowBtn) return;
    rowBtn = makeAddBtn(execAddRow);
    rowBtn.style.borderRadius = "0 0 4px 4px";
    colBtn = makeAddBtn(execAddCol);
    rowGrip = makeGrip(onRowGripClick);
    colGrip = makeGrip(onColGripClick);
  };

  const show = (tableEl) => {
    clearTimeout(hideTimer);
    currentTableEl = tableEl;
    ensureElements();
    positionAddButtons();
    rowBtn.style.display = "flex";
    colBtn.style.display = "flex";
  };

  // Get the visible boundary — .tableWrapper if it exists, otherwise the editor DOM
  const getVisibleBounds = () => {
    if (!currentTableEl || !editorView) return null;
    const wrapper = currentTableEl.closest(".tableWrapper");
    if (wrapper) return wrapper.getBoundingClientRect();
    // No tableWrapper — use the editor's content area as visible bounds
    return editorView.dom.getBoundingClientRect();
  };

  const positionAddButtons = () => {
    if (!currentTableEl || !rowBtn || !editorView) return;
    const vr = getVisibleBounds(); // visible rect (for horizontal bounds)
    if (!vr) return;
    const tr = currentTableEl.getBoundingClientRect(); // table rect (for vertical bounds)
    const rtl = isRTL(currentTableEl);

    // Row button: spans visible width, below the table
    rowBtn.style.left = vr.left + "px";
    rowBtn.style.top = tr.bottom + "px";
    rowBtn.style.width = vr.width + "px";
    rowBtn.style.height = "18px";

    // Col button: at the visible right edge, table's vertical position & height
    colBtn.style.display = "flex";
    if (rtl) {
      colBtn.style.left = vr.left - 20 + "px";
      colBtn.style.borderRadius = "4px 0 0 4px";
    } else {
      colBtn.style.left = vr.right + 2 + "px";
      colBtn.style.borderRadius = "0 4px 4px 0";
    }
    colBtn.style.top = tr.top + "px";
    colBtn.style.width = "18px";
    colBtn.style.height = tr.height + "px";
  };

  const positionGrips = (cellEl) => {
    if (!currentTableEl || !rowGrip || !cellEl) return;
    const vr = getVisibleBounds(); // horizontal bounds
    if (!vr) return;
    const tr = currentTableEl.getBoundingClientRect(); // table vertical bounds
    const cr = cellEl.getBoundingClientRect();
    const rtl = isRTL(currentTableEl);

    // Column grip: above the table, centered on the hovered column
    colGrip.style.left = cr.left + cr.width / 2 - 8 + "px";
    colGrip.style.top = tr.top - 16 + "px";
    colGrip.style.width = "16px";
    colGrip.style.height = "14px";
    colGrip.style.display = "flex";

    // Row grip: to the left (or right in RTL), aligned with the hovered row
    const rowEl = cellEl.closest("tr");
    if (rowEl) {
      const rr = rowEl.getBoundingClientRect();
      if (rtl) {
        rowGrip.style.left = vr.right + 4 + "px";
      } else {
        rowGrip.style.left = vr.left - 18 + "px";
      }
      rowGrip.style.top = rr.top + rr.height / 2 - 7 + "px";
      rowGrip.style.width = "14px";
      rowGrip.style.height = "16px";
      rowGrip.style.display = "flex";
    }
  };

  const hide = () => {
    currentTableEl = null;
    hoveredCell = null;
    [rowBtn, colBtn, rowGrip, colGrip].forEach((el) => {
      if (el) el.style.display = "none";
    });
  };

  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 300);
  };

  // ── Table helpers ──

  const findTableInfo = () => {
    if (!currentTableEl || !editorView) return null;
    try {
      const pos = editorView.posAtDOM(currentTableEl, 0);
      const $pos = editorView.state.doc.resolve(pos);
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type === schema.nodes.table)
          return { node: $pos.node(d), start: $pos.before(d) };
      }
    } catch (_) {}
    return null;
  };

  const selectCellAndRun = (offset, command) => {
    if (!editorView) return;
    try {
      const sel = editorView.state.selection.constructor.near(
        editorView.state.doc.resolve(offset),
      );
      editorView.dispatch(editorView.state.tr.setSelection(sel));
      command(editorView.state, editorView.dispatch);
      editorView.focus();
      requestAnimationFrame(positionAddButtons);
    } catch (_) {}
  };

  const selectRowCells = (rowEl) => {
    if (!editorView || !rowEl) return;
    try {
      const first = rowEl.children[0];
      const last = rowEl.children[rowEl.children.length - 1];
      const $f = editorView.state.doc.resolve(
        editorView.posAtDOM(first, 0),
      );
      const $l = editorView.state.doc.resolve(
        editorView.posAtDOM(last, 0),
      );
      editorView.dispatch(
        editorView.state.tr.setSelection(
          CellSelection.create(
            editorView.state.doc,
            $f.before($f.depth),
            $l.before($l.depth),
          ),
        ),
      );
    } catch (_) {}
  };

  const selectColCells = (cellEl) => {
    if (!editorView || !currentTableEl) return;
    try {
      const row = cellEl.closest("tr");
      const colIdx = Array.from(row.children).indexOf(cellEl);
      const rows = currentTableEl.querySelectorAll("tr");
      const first = rows[0].children[colIdx];
      const last = rows[rows.length - 1].children[colIdx];
      const $f = editorView.state.doc.resolve(
        editorView.posAtDOM(first, 0),
      );
      const $l = editorView.state.doc.resolve(
        editorView.posAtDOM(last, 0),
      );
      editorView.dispatch(
        editorView.state.tr.setSelection(
          CellSelection.create(
            editorView.state.doc,
            $f.before($f.depth),
            $l.before($l.depth),
          ),
        ),
      );
    } catch (_) {}
  };

  const clearSelectedCells = () => {
    if (!editorView) return;
    const sel = editorView.state.selection;
    if (!(sel instanceof CellSelection)) return;
    let tr = editorView.state.tr;
    sel.forEachCell((cell, pos) => {
      const start = pos + 1;
      const end = pos + cell.nodeSize - 1;
      if (end > start) {
        tr = tr.replaceWith(
          tr.mapping.map(start),
          tr.mapping.map(end),
          schema.nodes.paragraph.create(),
        );
      }
    });
    editorView.dispatch(tr);
    editorView.focus();
  };

  // ── + button actions ──

  const execAddRow = () => {
    const info = findTableInfo();
    if (!info) return;
    const { node: tableNode, start: tableStart } = info;
    let offset = tableStart + 1;
    for (let r = 0; r < tableNode.childCount - 1; r++)
      offset += tableNode.child(r).nodeSize;
    offset += 2;
    selectCellAndRun(offset, addRowAfter);
  };

  const execAddCol = () => {
    const info = findTableInfo();
    if (!info) return;
    const { node: tableNode, start: tableStart } = info;
    const firstRow = tableNode.child(0);
    let offset = tableStart + 2;
    for (let c = 0; c < firstRow.childCount - 1; c++)
      offset += firstRow.child(c).nodeSize;
    offset += 1;
    selectCellAndRun(offset, addColumnAfter);
  };

  // ── Grip actions ──

  const onRowGripClick = (gripEl) => {
    if (!hoveredCell) return;
    const rowEl = hoveredCell.closest("tr");
    const isHeaderRow = hoveredCell.tagName === "TH";
    selectRowCells(rowEl);

    const items = [];
    if (!isHeaderRow) {
      items.push({
        label: "Insert above",
        action: () => addRowBefore(editorView.state, editorView.dispatch),
      });
    }
    items.push({
      label: "Insert below",
      action: () => addRowAfter(editorView.state, editorView.dispatch),
    });
    items.push({ separator: true });
    items.push({ label: "Clear contents", action: clearSelectedCells });
    if (!isHeaderRow) {
      items.push({
        label: "Delete row",
        danger: true,
        action: () => {
          deleteRow(editorView.state, editorView.dispatch);
          editorView.focus();
        },
      });
    }
    items.push({ separator: true });
    items.push({
      label: "Delete table",
      danger: true,
      action: () => {
        deleteTable(editorView.state, editorView.dispatch);
        editorView.focus();
      },
    });

    showMenu(gripEl, items);
  };

  const onColGripClick = (gripEl) => {
    if (!hoveredCell) return;
    selectColCells(hoveredCell);

    showMenu(gripEl, [
      {
        label: "Insert left",
        action: () => addColumnBefore(editorView.state, editorView.dispatch),
      },
      {
        label: "Insert right",
        action: () => addColumnAfter(editorView.state, editorView.dispatch),
      },
      { separator: true },
      { label: "Clear contents", action: clearSelectedCells },
      {
        label: "Delete column",
        danger: true,
        action: () => {
          deleteColumn(editorView.state, editorView.dispatch);
          editorView.focus();
        },
      },
      { separator: true },
      {
        label: "Delete table",
        danger: true,
        action: () => {
          deleteTable(editorView.state, editorView.dispatch);
          editorView.focus();
        },
      },
    ]);
  };

  // ── Plugin ──

  return new Plugin({
    key: new PluginKey("tableControls"),

    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          editorView = view;
          const cellEl =
            event.target.closest && event.target.closest("td, th");
          const tableEl =
            event.target.closest &&
            (event.target.closest("table") ||
              (event.target.closest(".tableWrapper") &&
                event.target
                  .closest(".tableWrapper")
                  .querySelector("table")));

          if (tableEl && view.dom.contains(tableEl)) {
            if (currentTableEl !== tableEl) show(tableEl);
            else clearTimeout(hideTimer);

            if (cellEl && cellEl !== hoveredCell) {
              hoveredCell = cellEl;
              positionGrips(cellEl);
            }
          } else if (currentTableEl) {
            scheduleHide();
          }
          return false;
        },
        mouseleave() {
          if (!menuEl) scheduleHide();
          return false;
        },
      },
    },

    view(view) {
      editorView = view;

      // Reposition controls on scroll (rAF-throttled to avoid jank)
      let scrollRAF = null;
      const onScroll = () => {
        if (!currentTableEl) return;
        removeMenu();
        if (scrollRAF) return;
        scrollRAF = requestAnimationFrame(() => {
          scrollRAF = null;
          if (currentTableEl) {
            positionAddButtons();
            if (hoveredCell) positionGrips(hoveredCell);
          }
        });
      };

      window.addEventListener("scroll", onScroll, true);

      return {
        update() {
          if (currentTableEl) {
            if (!document.body.contains(currentTableEl)) hide();
            else positionAddButtons();
          }
        },
        destroy() {
          clearTimeout(hideTimer);
          if (scrollRAF) cancelAnimationFrame(scrollRAF);
          removeMenu();
          window.removeEventListener("scroll", onScroll, true);
          [rowBtn, colBtn, rowGrip, colGrip].forEach((el) => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
          });
          rowBtn = colBtn = rowGrip = colGrip = null;
        },
      };
    },
  });
}
