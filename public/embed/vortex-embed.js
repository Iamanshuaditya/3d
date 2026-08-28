/**
 * Vortex embeddable configurator — host loader (#27).
 *
 * Deliberately a loader and a message bridge, not the editor. The editor ships
 * three.js, Konva and React; injecting that into an arbitrary host page would
 * fight their bundler, their React version and their CSS. An iframe gives style
 * and script isolation the browser enforces, and lets the configurator be
 * updated without every manufacturer shipping a new SDK version.
 *
 * Usage:
 *   <script src="https://configurator.example.com/embed/vortex-embed.js"></script>
 *   <script>
 *     const session = Vortex.mount(document.getElementById("configurator"), {
 *       baseUrl: "https://configurator.example.com",
 *       client: "acme-packaging",
 *       product: "nexibles-rstz-190x265-110",
 *       onComplete: (result) => { ... },
 *       onError: (error) => { ... },
 *     });
 *   </script>
 */
(function (global) {
  "use strict";

  var NAMESPACE = "vortex-embed";
  var VERSION = 1;

  function envelope(payload) {
    return { namespace: NAMESPACE, version: VERSION, payload: payload };
  }

  function isEnvelope(data) {
    return (
      data &&
      typeof data === "object" &&
      data.namespace === NAMESPACE &&
      data.version === VERSION &&
      data.payload &&
      typeof data.payload === "object"
    );
  }

  function frameUrl(options) {
    var url = new URL(
      "/embed/" +
        encodeURIComponent(options.client) +
        "/" +
        encodeURIComponent(options.product),
      options.baseUrl
    );
    url.searchParams.set("host", global.location.origin);
    if (options.project) url.searchParams.set("project", options.project);
    if (options.options) url.searchParams.set("options", JSON.stringify(options.options));
    return url.toString();
  }

  function mount(container, options) {
    if (!container) throw new Error("Vortex.mount needs a container element.");
    if (!options || !options.baseUrl || !options.client || !options.product) {
      throw new Error("Vortex.mount needs baseUrl, client and product.");
    }

    var frameOrigin = new URL(options.baseUrl).origin;
    var iframe = document.createElement("iframe");
    iframe.src = frameUrl(options);
    iframe.title = options.title || "Product configurator";
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.height = (options.initialHeight || 720) + "px";
    // The frame needs uploads and pointer interaction and nothing else. Naming
    // the allow-list here means a host does not have to trust us not to ask.
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
    );
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("loading", "lazy");
    container.appendChild(iframe);

    function onMessage(event) {
      // A message from anywhere but the configurator origin is not ours, and a
      // host page may legitimately be talking to other frames.
      if (event.origin !== frameOrigin) return;
      if (event.source !== iframe.contentWindow) return;
      if (!isEnvelope(event.data)) return;

      var message = event.data.payload;
      switch (message.type) {
        case "ready":
          if (options.onReady) options.onReady(message);
          break;
        case "resize":
          if (options.autoResize !== false && message.heightPx > 0) {
            iframe.style.height = message.heightPx + "px";
          }
          if (options.onResize) options.onResize(message.heightPx);
          break;
        case "busy":
          if (options.onBusy) options.onBusy(message.busy, message.label);
          break;
        case "completed":
          if (options.onComplete) options.onComplete(message);
          break;
        case "error":
          if (options.onError) options.onError(message);
          break;
      }
    }

    global.addEventListener("message", onMessage);

    function post(payload) {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(envelope(payload), frameOrigin);
      }
    }

    return {
      iframe: iframe,
      /** Ask the configurator to finish and emit its completion event. */
      complete: function () {
        post({ type: "complete" });
      },
      /** Ask the configurator to re-measure after the host changed layout. */
      remeasure: function () {
        post({ type: "remeasure" });
      },
      destroy: function () {
        global.removeEventListener("message", onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      },
    };
  }

  global.Vortex = { mount: mount, protocolVersion: VERSION };
})(window);
