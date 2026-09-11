/** Vortex browser loader. Keep merchant API keys on your server. */
(function (global) {
  "use strict";
  var NAMESPACE = "vortex-embed";
  var VERSION = 1;

  function envelope(payload) {
    return { namespace: NAMESPACE, version: VERSION, payload: payload };
  }
  function isEnvelope(data) {
    return data && typeof data === "object" && data.namespace === NAMESPACE &&
      data.version === VERSION && data.payload && typeof data.payload === "object";
  }
  function frameUrl(options) {
    var url;
    if (options.editorUrl) {
      url = new URL(options.editorUrl);
      if (url.searchParams.get("host") !== global.location.origin) {
        throw new Error("Create this editor session with your website's hostOrigin.");
      }
    } else {
      if (!options.baseUrl || !options.client || !options.product) {
        throw new Error("Pass the editorUrl returned by your server, or baseUrl, client and product.");
      }
      url = new URL("/embed/" + encodeURIComponent(options.client) + "/" + encodeURIComponent(options.product), options.baseUrl);
      url.searchParams.set("host", global.location.origin);
      if (options.project) url.searchParams.set("project", options.project);
      if (options.options) url.searchParams.set("options", JSON.stringify(options.options));
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || !/^\/embed\/[^/]+\/[^/]+$/.test(url.pathname)) {
      throw new Error("Use a valid Vortex editor URL.");
    }
    return url;
  }

  function mount(container, options) {
    if (!container || !options) throw new Error("Vortex.mount needs a container and options.");
    var url = frameUrl(options);
    var frameOrigin = url.origin;
    var sessionId = url.searchParams.get("session");
    var iframe = document.createElement("iframe");
    iframe.src = url.toString();
    iframe.title = options.title || "Product editor";
    iframe.className = "vortex-editor-frame";
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.height = options.fill ? "100%" : (options.initialHeight || 720) + "px";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-downloads");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("loading", options.fill ? "eager" : "lazy");

    function onMessage(event) {
      if (event.origin !== frameOrigin || event.source !== iframe.contentWindow || !isEnvelope(event.data)) return;
      var message = event.data.payload;
      if (sessionId && (message.type === "ready" || message.type === "completed") && message.sessionId !== sessionId) return;
      switch (message.type) {
        case "ready":
          if (options.onReady) options.onReady(message);
          break;
        case "resize":
          if (options.autoResize !== false && Number.isFinite(message.heightPx) && message.heightPx > 0 && message.heightPx < 100000) {
            iframe.style.height = message.heightPx + "px";
          }
          if (options.onResize) options.onResize(message.heightPx);
          break;
        case "busy":
          if (options.onBusy) options.onBusy(message.busy, message.label);
          break;
        case "completed":
          if (sessionId && (!message.result || message.result.sessionId !== sessionId)) return;
          if (options.onComplete) options.onComplete(message.result || message);
          break;
        case "error":
          if (options.onError) options.onError(message);
          break;
      }
    }
    global.addEventListener("message", onMessage);
    container.appendChild(iframe);

    function post(payload) {
      if (iframe.contentWindow) iframe.contentWindow.postMessage(envelope(payload), frameOrigin);
    }
    return {
      iframe: iframe,
      complete: function () { post({ type: "complete" }); },
      remeasure: function () { post({ type: "remeasure" }); },
      destroy: function () {
        global.removeEventListener("message", onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
    };
  }

  function open(options) {
    if (!options || !options.editorUrl) throw new Error("Vortex.open needs the editorUrl returned by your server.");
    var url = frameUrl(options);
    var cssUrl = new URL("/embed/vortex-embed.css", url.origin).toString();
    if (!Array.from(document.querySelectorAll("link[rel=stylesheet]")).some(function (link) { return link.href === cssUrl; })) {
      var stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = cssUrl;
      document.head.appendChild(stylesheet);
    }
    var dialog = document.createElement("dialog");
    dialog.className = "vortex-dialog";
    dialog.setAttribute("aria-label", options.title || "Customize your product");
    var bar = document.createElement("div");
    bar.className = "vortex-dialog-bar";
    var label = document.createElement("span");
    label.textContent = options.title || "Make it yours";
    var closeButton = document.createElement("button");
    closeButton.className = "vortex-close";
    closeButton.type = "button";
    closeButton.textContent = "Close editor ×";
    var workspace = document.createElement("div");
    workspace.className = "vortex-dialog-workspace";
    var loading = document.createElement("div");
    loading.className = "vortex-loading";
    loading.setAttribute("role", "status");
    loading.textContent = "Opening your product…";
    bar.appendChild(label);
    bar.appendChild(closeButton);
    dialog.appendChild(bar);
    dialog.appendChild(workspace);
    workspace.appendChild(loading);
    document.body.appendChild(dialog);

    var instance;
    var closed = false;
    var previousFocus = document.activeElement;
    var timeout = global.setTimeout(function () {
      loading.textContent = "The editor is taking longer to load. Close it and try again.";
      if (options.onError) options.onError({ code: "LOAD_TIMEOUT", message: loading.textContent });
    }, options.loadTimeoutMs || 45000);
    function close() {
      if (closed) return;
      closed = true;
      global.clearTimeout(timeout);
      if (instance) instance.destroy();
      dialog.close();
      dialog.remove();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
      if (options.onClose) options.onClose();
    }
    closeButton.addEventListener("click", close);
    dialog.addEventListener("cancel", function (event) { event.preventDefault(); close(); });
    instance = mount(workspace, Object.assign({}, options, {
      fill: true,
      autoResize: false,
      onReady: function (message) {
        global.clearTimeout(timeout);
        loading.remove();
        if (options.onReady) options.onReady(message);
      },
      onComplete: function (result) {
        try { if (options.onComplete) options.onComplete(result); }
        finally { if (options.closeOnComplete !== false) close(); }
      }
    }));
    dialog.showModal();
    closeButton.focus();
    return { iframe: instance.iframe, complete: instance.complete, remeasure: instance.remeasure, close: close, destroy: close };
  }
  global.Vortex = { mount: mount, open: open, protocolVersion: VERSION };
})(window);
