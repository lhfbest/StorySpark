/*************************************************
 * ES5 兼容版前端（无箭头函数、无 const/let、无可选链、无模板串）
 * - 三重触发：addEventListener、事件委托、内联 onclick 兜底
 * - 每次请求即时读取下拉框值
 * - 启动自检：打印 [boot] ok；异常时红条提示
 *************************************************/

(function () {
  function bootError(msg) {
    try {
      var bar = document.getElementById("bootError");
      if (!bar) return;
      bar.textContent = msg;
      bar.style.display = "block";
    } catch (e) {}
  }

  function safe(fn) {
    return function() {
      try { return fn.apply(this, arguments); }
      catch (e) { console.error(e); bootError("脚本运行出错：" + e.message); }
    };
  }

  function $(sel) { return document.querySelector(sel); }

  function addEvent(el, type, handler) {
    if (!el) return;
    if (el.addEventListener) el.addEventListener(type, handler, false);
    else if (el.attachEvent) el.attachEvent("on" + type, handler);
    else el["on" + type] = handler;
  }

  addEvent(document, "DOMContentLoaded", safe(function() {
    var app = $("#appContainer");
    var treeEl = $("#tree");
    var seedEl = $("#seed");
    var btnSeed = $("#btnSeed");
    var rootCardEl = $("#rootCard");
    var rootSummaryEl = $("#rootSummary");
    var edgesSvg = $("#edgesSvg");
    var btnExport = $("#btnExport");
    var modelSelect = $("#modelSelect");
    var summaryPanel = $("#summaryPanel");
    var togglePanelBtn = $("#togglePanel");
    var worldProgressEl = $("#worldProgress");
    var knownGridEl = $("#knownGrid");

    if (!app || !seedEl || !btnSeed || !modelSelect || !treeEl) {
      bootError("关键元素未找到：请刷新页面（Ctrl+F5）");
      return;
    }
    try { console.log("[boot] ok"); } catch(e){}

    /* —— 即时读取 provider —— */
    function getProvider() {
      try {
        var v = modelSelect && modelSelect.value ? modelSelect.value : (modelSelect && modelSelect.getAttribute("data-default")) || "deepseek";
        v = String(v || "").toLowerCase();
        return (v === "gemini" || v === "deepseek") ? v : "deepseek";
      } catch (e) { return "deepseek"; }
    }

    /* —— 首次加载：显式把下拉复位到 data-default —— */
    (function resetSelectOnLoad() {
      try {
        var d = (modelSelect && modelSelect.getAttribute("data-default")) || "deepseek";
        var opts = modelSelect ? modelSelect.options : null;
        if (opts) {
          for (var i=0;i<opts.length;i++){ if (opts[i].value === d){ modelSelect.selectedIndex = i; break; } }
        }
        try { console.log("[ui] provider(initial ui) =", getProvider()); } catch(e){}
      } catch (e) {}
    })();

    /* —— 折叠面板 —— */
    if (togglePanelBtn) {
      addEvent(togglePanelBtn, "click", function(){
        if (!summaryPanel) return;
        if (summaryPanel.classList) {
          summaryPanel.classList.toggle("collapsed");
        } else {
          // 兼容：简单切换 className
          if ((" " + summaryPanel.className + " ").indexOf(" collapsed ") >= 0) {
            summaryPanel.className = summaryPanel.className.replace(/\bcollapsed\b/, "");
          } else {
            summaryPanel.className += " collapsed";
          }
        }
        var mainArea = document.querySelector("#mainArea");
        var collapsed = (" " + summaryPanel.className + " ").indexOf(" collapsed ") >= 0;
        if (mainArea) mainArea.style.marginLeft = collapsed ? "56px" : "";
        togglePanelBtn.textContent = collapsed ? "⟩" : "⟨⟩";
      });
    }

    /* —— 清单定义 —— */
    var KNOWN_SCHEMA = [
      { sec: "第一部分：故事内核与基调", items: [
        "核心概念 (High Concept)","题材类型 (Genre)","故事基调 (Tone & Mood)","核心主题 (Central Theme)","目标读者 (Target Audience)"
      ]},
      { sec: "第二部分：世界观设定", items: ["宏观背景 (Macro Setting)","社会结构 (Social Structure)"]},
      { sec: "第三部分：核心系统与规则", items: [
        "力量体系 (Power System)","金手指/特殊优势 (Protagonist's Edge)","核心物品与道具 (Key Items & Artifacts)"
      ]},
      { sec: "第四部分：角色设定", items: [
        "主角设定 (Protagonist)","反派设定 (Antagonist)","配角设定 (Supporting Cast)","人际关系网 (Relationship Web)"
      ]},
      { sec: "第五部分：剧情结构与叙事", items: [
        "故事主线 (Main Plot)","核心矛盾 (Core Conflict)","叙事视角 (Narrative Perspective)","关键情节节点 (Key Plot Points)","支线情节 (Subplots)"
      ]},
    ];

    /* —— 状态与结构 —— */
    var idCounter = 0;
    function uid(p){ idCounter+=1; return p + "_" + idCounter; }
    var state = { seed: "", rootSummary: "", rootLevel: null, selected: null };

    function newNode(text, isOther){
      return { id: uid("N"), text: text || "", isOther: !!isOther, customText: "", summary: "", childrenLevel: null, knownFields: null };
    }
    function newLevel(nodes, parentNode){
      return { id: uid("L"), nodes: nodes, expandedIndex: null, parentNode: parentNode || null };
    }

    function renderKnownGrid(values) {
      knownGridEl.innerHTML = "";
      for (var s=0;s<KNOWN_SCHEMA.length;s++){
        var section = KNOWN_SCHEMA[s];
        var h = document.createElement("div");
        h.className = "known-key";
        h.style.gridColumn = "1 / -1";
        h.style.margin = "6px 0 2px";
        h.style.fontWeight = "700";
        h.appendChild(document.createTextNode(section.sec));
        knownGridEl.appendChild(h);

        for (var j=0;j<section.items.length;j++){
          var label = section.items[j];
          var k = document.createElement("div"); k.className = "known-key"; k.appendChild(document.createTextNode(label));
          var v = document.createElement("div"); v.className = "known-val";
          v.appendChild(document.createTextNode(values && values[label] ? values[label] : "未知"));
          knownGridEl.appendChild(k); knownGridEl.appendChild(v);
        }
      }
    }
    function setWorldProgress(arr) {
      worldProgressEl.innerHTML = "";
      if (!arr) return;
      for (var i=0;i<arr.length;i++){
        var li = document.createElement("li");
        li.appendChild(document.createTextNode(arr[i]));
        worldProgressEl.appendChild(li);
      }
    }

    function approximateKnown(knownFields, seed, rootSummary, progress) {
      var result = {};
      var text = (rootSummary || seed || "");
      text = String(text).trim();
      var firstSent = text.split(/。|！|!|？|\?|；|;/)[0] || text;
      firstSent = firstSent.slice(0,80);
      function put(k, v){ if (v && String(v).trim()) result[k] = String(v).trim(); }

      put("核心概念 (High Concept)", firstSent || String(seed||"").slice(0,80));
      var cat = ""; var pool = [["玄幻","玄幻"],["奇幻","奇幻"],["科幻","科幻"],["都市","都市"],["历史","历史"],["言情","言情"],["悬疑","悬疑"],["推理","推理"],["末日","末日"],["武侠","武侠"]];
      var mix = String(seed||"") + String(rootSummary||"");
      for (var ii=0; ii<pool.length; ii++){ if (mix.indexOf(pool[ii][0]) >= 0){ cat = pool[ii][1]; break; } }
      put("题材类型 (Genre)", cat || "未知");
      put("故事基调 (Tone & Mood)", /黑暗|沉重|轻松|幽默|浪漫/.test(mix) ? (mix.match(/黑暗|沉重|轻松|幽默|浪漫/)||["未知"])[0] : "未知");
      put("核心主题 (Central Theme)", rootSummary ? String(rootSummary).slice(0,120) : "未知");
      put("目标读者 (Target Audience)", "未知");

      put("宏观背景 (Macro Setting)", /现代|古代|未来|星际|末日/.test(mix) ? (mix.match(/现代|古代|未来|星际|末日/)||["未知"])[0] : (String(seed||"").slice(0,60)||"未知"));
      put("社会结构 (Social Structure)", "未知");

      put("力量体系 (Power System)", /(修炼|灵气|魔法|异能|能力|系统)/.test(mix) ? ("存在 " + (mix.match(/修炼|灵气|魔法|异能|能力|系统/)||[""])[0] + " 体系") : "未知");
      put("金手指/特殊优势 (Protagonist's Edge)", /(金手指|系统|重生|穿越|外挂)/.test(mix) ? ("拥有 " + (mix.match(/金手指|系统|重生|穿越|外挂/)||[""])[0]) : "未知");
      put("核心物品与道具 (Key Items & Artifacts)", /(神器|戒指|法器|芯片|原型机)/.test(mix) ? ("涉及 " + (mix.match(/神器|戒指|法器|芯片|原型机/)||[""])[0]) : "未知");

      put("主角设定 (Protagonist)", /主角[：:]\s*([^\n。]+)/.test(mix) ? (mix.match(/主角[：:]\s*([^\n。]+)/)||["","未知"])[1] : "未知");
      put("反派设定 (Antagonist)", "未知");
      put("配角设定 (Supporting Cast)", "未知");
      put("人际关系网 (Relationship Web)", "未知");

      put("故事主线 (Main Plot)", rootSummary ? String(rootSummary).slice(0,140) : (String(seed||"").slice(0,140) || "未知"));
      put("核心矛盾 (Core Conflict)", /(冲突|矛盾|对抗|危机)/.test(mix) ? ("存在 " + (mix.match(/冲突|矛盾|对抗|危机/)||[""])[0]) : "未知");
      put("叙事视角 (Narrative Perspective)", /(第一人称|第三人称)/.test(mix) ? (mix.match(/第一人称|第三人称/)||["未知"])[0] : "未知");
      put("关键情节节点 (Key Plot Points)", (progress && progress.length) ? progress.join("；") : "未知");
      put("支线情节 (Subplots)", "未知");

      // 已知字段覆盖
      if (knownFields && typeof knownFields === "object") {
        for (var si=0; si<KNOWN_SCHEMA.length; si++){
          var sec = KNOWN_SCHEMA[si];
          for (var li=0; li<sec.items.length; li++){
            var label = sec.items[li];
            try {
              var v = knownFields[sec.sec] && knownFields[sec.sec][label];
              if (v && String(v).trim()) result[label] = String(v).trim();
            } catch(e){}
          }
        }
      }
      return result;
    }

    function getLevelOfNode(node) {
      function dfs(level) {
        if (!level) return null;
        for (var i=0;i<level.nodes.length;i++){
          if (level.nodes[i] === node) return level;
          var sub = level.nodes[i].childrenLevel;
          var f = dfs(sub); if (f) return f;
        }
        return null;
      }
      return dfs(state.rootLevel);
    }
    function getParentLevel(level) {
      if (!level || !level.parentNode) return null;
      return getLevelOfNode(level.parentNode);
    }
    function collectHistoryUpToLevel(level) {
      var parts = [];
      if (state.seed) parts.push("【根信息】\n" + state.seed);
      var cur = level;
      while (cur && cur.parentNode) {
        var p = cur.parentNode;
        if (p.text) parts.push("【已确认选择】\n" + p.text);
        cur = getLevelOfNode(p);
        if (cur) cur = getParentLevel(cur);
      }
      return parts;
    }
    function collectFullPathIncluding(level, selectedText) {
      var path = [];
      if (state.seed) path.push("【根信息】\n" + state.seed);
      var stack = [];
      var cur = level;
      while (cur && cur.parentNode) {
        var p = cur.parentNode;
        if (p.text) stack.push(p.text);
        cur = getLevelOfNode(p);
        if (cur) cur = getParentLevel(cur);
      }
      stack.reverse();
      for (var i=0;i<stack.length;i++) path.push(stack[i]);
      if (selectedText && String(selectedText).trim()) path.push(String(selectedText).trim());
      return path;
    }

    function applySelectionStyles() {
      if (rootCardEl && rootCardEl.classList) rootCardEl.classList.remove("glow");
      var allNodes = treeEl.querySelectorAll(".node");
      for (var i=0;i<allNodes.length;i++){
        if (allNodes[i].classList) {
          allNodes[i].classList.remove("glow"); allNodes[i].classList.remove("selected"); allNodes[i].classList.remove("dimmed");
        }
      }
      if (!state.selected) return;

      var levelId = state.selected.levelId, nodeIdx = state.selected.nodeIdx;
      var selectedEl = treeEl.querySelector('.node[data-level-id="'+levelId+'"][data-node-idx="'+nodeIdx+'"]');
      if (!selectedEl) return;

      if (selectedEl.classList){ selectedEl.classList.add("selected"); selectedEl.classList.add("glow"); }
      if (rootCardEl && rootCardEl.classList) rootCardEl.classList.add("glow");

      var keep = {};
      keep[levelId + "|" + nodeIdx] = true;

      var curLevel = findLevelById(levelId);
      while (curLevel && curLevel.parentNode) {
        var pl = getLevelOfNode(curLevel.parentNode);
        var pn = curLevel.parentNode;
        if (pl) {
          var pIdx = -1;
          for (var k=0;k<pl.nodes.length;k++){ if (pl.nodes[k]===pn){ pIdx=k; break; } }
          keep[pl.id + "|" + pIdx] = true;
          var pEl = treeEl.querySelector('.node[data-level-id="'+pl.id+'"][data-node-idx="'+pIdx+'"]');
          if (pEl && pEl.classList) pEl.classList.add("glow");
          curLevel = pl;
        } else { break; }
      }

      var selLevel = findLevelById(levelId);
      if (selLevel) {
        var selNode = selLevel.nodes[nodeIdx];
        var L = selNode && selNode.childrenLevel;
        while (L) {
          for (var z=0;z<L.nodes.length;z++){ keep[L.id + "|" + z] = true; }
          var idx = L.expandedIndex;
          if (idx!=null && idx>=0 && L.nodes[idx] && L.nodes[idx].childrenLevel) { L = L.nodes[idx].childrenLevel; }
          else break;
        }
      }

      for (var i2=0;i2<allNodes.length;i2++){
        var el = allNodes[i2];
        var lid = el.getAttribute("data-level-id");
        var nidx = el.getAttribute("data-node-idx");
        if (!keep[lid + "|" + nidx]) { if (el.classList) el.classList.add("dimmed"); }
      }
    }

    function findLevelById(id) {
      function dfs(level){ if(!level) return null; if(level.id===id) return level;
        for(var i=0;i<level.nodes.length;i++){ var f=dfs(level.nodes[i].childrenLevel); if(f) return f; } return null; }
      return dfs(state.rootLevel);
    }
    function buildVisibleLevels() {
      var levels = []; var cur = state.rootLevel;
      while (cur) {
        levels.push(cur);
        var idx = cur.expandedIndex;
        if (idx!=null && idx>=0 && cur.nodes[idx] && cur.nodes[idx].childrenLevel) cur = cur.nodes[idx].childrenLevel; else break;
      }
      return levels;
    }
    function drawCurve(start,end){
      var dy = Math.max(40, (end.y - start.y) * 0.4);
      var c1 = {x:start.x, y:start.y + dy};
      var c2 = {x:end.x, y:end.y - dy};
      var d = "M " + start.x + " " + start.y + " C " + c1.x + " " + c1.y + ", " + c2.x + " " + c2.y + ", " + end.x + " " + end.y;
      var path = document.createElementNS("http://www.w3.org/2000/svg","path");
      path.setAttribute("d", d);
      path.setAttribute("class", "edge-path");
      edgesSvg.appendChild(path);
    }
    function drawEdges() {
      var mainArea = document.querySelector('#mainArea');
      if (!mainArea) return;
      var crect = mainArea.getBoundingClientRect ? mainArea.getBoundingClientRect() : {width: mainArea.clientWidth, height: mainArea.clientHeight, left:0, top:0};
      var height = mainArea.scrollHeight || crect.height || 0;
      var width = crect.width || mainArea.clientWidth || 0;
      edgesSvg.setAttribute("width", String(width));
      edgesSvg.setAttribute("height", String(height));
      edgesSvg.setAttribute("viewBox", "0 0 " + width + " " + height);
      edgesSvg.style.left = "0px";
      edgesSvg.style.top = "0px";
      edgesSvg.innerHTML = "";

      function rel(el) {
        var r = el.getBoundingClientRect ? el.getBoundingClientRect() : {left:0, top:0, width:el.offsetWidth, height:el.offsetHeight, right:0, bottom:0};
        var m = mainArea.getBoundingClientRect ? mainArea.getBoundingClientRect() : {left:0, top:0};
        return { x: r.left - m.left + (r.width||el.offsetWidth||0)/2,
                 top: r.top - m.top,
                 bottom: (r.bottom ? r.bottom - m.top : (r.top - m.top + (r.height||el.offsetHeight||0))),
                 y: r.top - m.top + (r.height||el.offsetHeight||0)/2 };
      }

      if (state.rootLevel) {
        var p = rel(rootCardEl), start = {x:p.x, y:p.bottom};
        var levelEls = document.querySelectorAll('#tree .level');
        if (levelEls[0]) {
          var firstNodes = levelEls[0].querySelectorAll('.node');
          for (var i=0;i<firstNodes.length;i++){
            var c = rel(firstNodes[i]);
            drawCurve(start, {x:c.x, y:c.top});
          }
        }
      }
      var levels = buildVisibleLevels();
      for (var li=0; li<levels.length-1; li++){
        var level = levels[li], parentIdx = level.expandedIndex;
        if (parentIdx == null) continue;
        var parentEl = document.querySelector('.node[data-level-id="'+level.id+'"][data-node-idx="'+parentIdx+'"]');
        if (!parentEl) continue;
        var p2 = rel(parentEl), start2 = {x:p2.x, y:p2.bottom};
        var childLevelEl = document.querySelector('#tree .level:nth-of-type(' + (li+2) + ')');
        if (!childLevelEl) continue;
        var nodes = childLevelEl.querySelectorAll('.node');
        for (var ni=0; ni<nodes.length; ni++){
          var c2 = rel(nodes[ni]);
          drawCurve(start2, {x:c2.x, y:c2.top});
        }
      }
    }
    function buildVisibleAndRender() {
      treeEl.innerHTML = "";
      var visible = buildVisibleLevels();
      for (var vi=0; vi<visible.length; vi++){
        var level = visible[vi];
        var levelEl = document.createElement("div"); levelEl.className = "level";
        var nodesEl = document.createElement("div"); nodesEl.className = "nodes";
        for (var i=0;i<level.nodes.length;i++){
          var node = level.nodes[i];
          var nodeEl = document.createElement("div"); nodeEl.className = "node";
          nodeEl.setAttribute("data-level-id", level.id);
          nodeEl.setAttribute("data-node-idx", i);

          addEvent(nodeEl, "click", (function(levelRef, idxRef){
            return function(evt){ onNodeClick(levelRef, idxRef, evt || window.event); };
          })(level, i));

          var contentEl = document.createElement("div"); contentEl.className = "content";
          contentEl.appendChild(document.createTextNode(node.text || (node.isOther ? "其他选择" : "")));

          var actionsEl = document.createElement("div"); actionsEl.className = "actions";

          var btnConfirm = document.createElement("button"); btnConfirm.className = "btn"; btnConfirm.type="button";
          btnConfirm.appendChild(document.createTextNode("确认生成后续"));
          addEvent(btnConfirm, "click", (function(levelRef, idxRef){
            return function(e){ if(e && e.stopPropagation) e.stopPropagation(); confirmAndGenerate(levelRef, idxRef); };
          })(level, i));

          var btnPick = document.createElement("button"); btnPick.className = "btn btn-secondary"; btnPick.type="button";
          btnPick.appendChild(document.createTextNode("设为当前选择"));
          addEvent(btnPick, "click", (function(nodeRef){
            return function(e){
              if(e && e.stopPropagation) e.stopPropagation();
              var txt = nodeRef.text || "";
              if (nodeRef.isOther) txt = (nodeRef.customText || "").trim();
              if (!txt) { alert("请先填写内容"); return; }
              alert("已设为当前考虑的选择：\n" + txt + "\n（若要生成走向，请点击‘确认生成后续’）");
            };
          })(node));

          actionsEl.appendChild(btnConfirm);
          actionsEl.appendChild(btnPick);

          var otherWrap = document.createElement("div"); otherWrap.className = "other-input";
          if (node.isOther) {
            var ta = document.createElement("textarea");
            ta.placeholder = "填写你的‘其他选择’（确认时将使用该内容）";
            ta.value = node.customText || "";
            addEvent(ta, "input", (function(nodeRef){ return function(e){ nodeRef.customText = e.target ? e.target.value : ta.value; }; })(node));
            otherWrap.appendChild(ta);
          }

          if (node.childrenLevel) {
            var btnToggle = document.createElement("button"); btnToggle.className = "btn btn-secondary"; btnToggle.type="button";
            var isExpanded = level.expandedIndex === i;
            btnToggle.appendChild(document.createTextNode(isExpanded ? "收起" : "展开"));
            addEvent(btnToggle, "click", (function(levelRef, idxRef){
              return function(e){ if(e && e.stopPropagation) e.stopPropagation(); levelRef.expandedIndex = (levelRef.expandedIndex===idxRef?null:idxRef); render(); };
            })(level, i));
            var badge = document.createElement("span"); badge.className="badge";
            badge.innerHTML = '<span class="dot"></span>已生成后续';
            actionsEl.appendChild(btnToggle); actionsEl.appendChild(badge);
            if (isExpanded && nodeEl.classList) nodeEl.classList.add("expanded");
          }

          nodeEl.appendChild(contentEl);
          nodeEl.appendChild(actionsEl);
          nodeEl.appendChild(otherWrap);
          nodesEl.appendChild(nodeEl);
        }
        levelEl.appendChild(nodesEl);
        treeEl.appendChild(levelEl);
      }
      drawEdges(); applySelectionStyles();
    }
    function render(){ buildVisibleAndRender(); }

    function setNodeBusy(levelId, nodeIdx, busy) {
      var nodeEl = treeEl.querySelector('.node[data-level-id="'+levelId+'"][data-node-idx="'+nodeIdx+'"]');
      if (!nodeEl) return;
      var badge = nodeEl.querySelector(".node-busy");
      if (busy) {
        if (!badge) {
          badge = document.createElement("div");
          badge.className = "node-busy";
          badge.innerHTML = '<span class="dot"></span><span>正在生成…</span>';
          nodeEl.appendChild(badge);
        }
        var bs = nodeEl.querySelectorAll("button");
        for (var i=0;i<bs.length;i++){ bs[i].disabled = true; }
      } else {
        if (badge) nodeEl.removeChild(badge);
        var bs2 = nodeEl.querySelectorAll("button");
        for (var j=0;j<bs2.length;j++){ bs2[j].disabled = false; }
      }
    }

    function onNodeClick(level, idx, event) {
      var tag = (event && event.target && event.target.tagName || "").toLowerCase();
      if (tag === "button" || tag === "textarea" || tag === "select") return;

      state.selected = { levelId: level.id, nodeIdx: idx };

      var node = level.nodes[idx];
      var txt = node.isOther ? (node.customText || node.text) : node.text;
      var fullPath = collectFullPathIncluding(level, txt || "");
      var decisions = fullPath.slice(1);
      setWorldProgress(decisions);
      renderKnownGrid(approximateKnown(node.knownFields, state.seed, state.rootSummary, decisions));
      applySelectionStyles();
    }

    function confirmAndGenerate(level, nodeIndex) {
      var node = level.nodes[nodeIndex];
      var selectedText = node.text || "";
      if (node.isOther) {
        selectedText = (node.customText || "");
        selectedText = String(selectedText).trim();
        if (!selectedText) { alert("请先填写‘其他选择’的内容"); return; }
      }

      var history = collectHistoryUpToLevel(level);
      var fullPath = collectFullPathIncluding(level, selectedText);
      var provider = getProvider();
      try { console.log("[api] /api/summarize_and_expand provider ->", provider); } catch(e){}

      setNodeBusy(level.id, nodeIndex, true);
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/summarize_and_expand", true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = function(){
          if (xhr.readyState === 4) {
            setNodeBusy(level.id, nodeIndex, false);
            if (xhr.status >= 200 && xhr.status < 300) {
              var text = xhr.responseText || "";
              var data = null;
              try { data = JSON.parse(text); } catch (e) { alert("服务端返回的不是 JSON：\n" + text.slice(0,300)); return; }
              if (!data.ok) { alert(data.error || "调用失败"); return; }

              node.summary = data.stage_summary || "";
              node.childrenLevel = newLevel([
                newNode((data.choices && data.choices[0]) || ""),
                newNode((data.choices && data.choices[1]) || ""),
                newNode((data.choices && data.choices[2]) || ""),
                newNode(data.other || "其他选择", true)
              ], node);
              level.expandedIndex = nodeIndex;

              var progress = (data.worldline && data.worldline.progress && data.worldline.progress.filter) ? data.worldline.progress.filter(Boolean) : [];
              setWorldProgress(progress);

              node.knownFields = data.known_fields || {};
              renderKnownGrid(approximateKnown(node.knownFields, state.seed, state.rootSummary, progress));

              state.selected = { levelId: level.id, nodeIdx: nodeIndex };
              render();
            } else {
              alert("网络错误：" + xhr.status);
            }
          }
        };
        xhr.send(JSON.stringify({ history: history, selected: selectedText, prior_summary: "", provider: provider, path: fullPath }));
      } catch (err) {
        setNodeBusy(level.id, nodeIndex, false);
        alert("出错了：" + (err && err.message ? err.message : err));
      }
    }

    // —— 初次三选一（用 XHR，避免 fetch 在老浏览器上不可用） —— //
    function onSeedClick() {
      var seed = (seedEl.value || "").trim();
      if (!seed) { alert("请先输入已有信息/灵感"); return; }

      var provider = getProvider();
      try { console.log("[api] /api/initial provider ->", provider); } catch(e){}

      btnSeed.disabled = true;
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/initial", true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = function(){
          if (xhr.readyState === 4) {
            btnSeed.disabled = false;
            if (xhr.status >= 200 && xhr.status < 300) {
              var text = xhr.responseText || "";
              var data = null;
              try { data = JSON.parse(text); } catch (e) { alert("服务端返回的不是 JSON：\n" + text.slice(0,300)); return; }
              if (!data.ok) { alert(data.error || "调用失败"); return; }

              state.seed = seed;
              state.rootSummary = data.summary || "";
              if (state.rootSummary) {
                rootSummaryEl.style.display = "block";
                rootSummaryEl.textContent = "已知信息整理：\n" + state.rootSummary;
              } else {
                rootSummaryEl.style.display = "none";
              }

              state.rootLevel = newLevel([
                newNode(data.choices[0]),
                newNode(data.choices[1]),
                newNode(data.choices[2]),
                newNode(data.other || "其他选择", true)
              ], null);

              renderKnownGrid(approximateKnown({}, state.seed, state.rootSummary, []));
              setWorldProgress([]);
              state.selected = null;
              render();
            } else {
              alert("网络错误：" + xhr.status);
            }
          }
        };
        xhr.send(JSON.stringify({ seed: seed, provider: provider }));
      } catch (err) {
        btnSeed.disabled = false;
        alert("出错了：" + (err && err.message ? err.message : err));
      }
    }

    // —— 绑定三重触发 —— //
    addEvent(btnSeed, "click", onSeedClick);
    btnSeed.onclick = onSeedClick;

    addEvent(document, "click", function(ev){
      ev = ev || window.event;
      var t = ev.target || ev.srcElement;
      if (!t) return;
      // 兼容 closest：逐级向上找
      var el = t;
      while (el && el !== document && !(el.getAttribute && el.getAttribute("data-action") === "seed-confirm")) {
        el = el.parentNode;
      }
      if (el && el.id === "btnSeed") {
        onSeedClick();
      }
    });

    // 暴露给内联 onclick 兜底
    window.__onSeedClick = onSeedClick;

    // 公开内部函数（可选）
    window.confirmAndGenerate = confirmAndGenerate;

    // 导出
    if (btnExport) addEvent(btnExport, "click", function(){
      var payload = { project: "火花生文", provider: getProvider(), seed: state.seed, root_summary: state.rootSummary, tree: serializeLevel(state.rootLevel) };
      try {
        var json = JSON.stringify(payload, null, 2);
        var blob = new Blob([json], {type: "application/json"});
        var url = (window.URL || window.webkitURL).createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "火花生文_大纲.json";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        (window.URL || window.webkitURL).revokeObjectURL(url);
      } catch (e) { alert("导出失败：" + (e && e.message ? e.message : e)); }
    });

    function serializeLevel(level){ if(!level) return null; 
      var arr = []; if (level.nodes && level.nodes.length){
        for (var i=0;i<level.nodes.length;i++){
          var n = level.nodes[i];
          arr.push({ text: n.text, isOther: !!n.isOther, customText: n.customText || "", summary: n.summary || "", children: serializeLevel(n.childrenLevel) });
        }
      }
      return { expandedIndex: level.expandedIndex, nodes: arr };
    }

    // 首次渲染（空树）
    render();
    // 调整边的重绘
    addEvent(window, "resize", function(){ setTimeout(drawEdges, 0); });

  })); // DOMContentLoaded
})();
