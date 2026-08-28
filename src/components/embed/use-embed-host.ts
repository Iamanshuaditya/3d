"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  embedEnvelope,
  parseInboundMessage,
  type EmbedErrorCode,
  type EmbedOutboundMessage,
} from "@/lib/embed/protocol";

type UseEmbedHostInput = {
  /** The exact origin permitted to host this frame. Never "*". */
  hostOrigin: string;
  clientId: string;
  productId: string;
  rootRef: RefObject<HTMLDivElement | null>;
};

/**
 * The frame's half of the host bridge (#27).
 *
 * Every outbound message is addressed to the client's registered origin
 * specifically: posting to `*` would broadcast a customer's project reference
 * to whatever page happens to be framing us, which is exactly the leak the
 * origin allow-list exists to prevent. Inbound messages from any other origin
 * are dropped without a reply.
 */
export function useEmbedHost({ hostOrigin, clientId, productId, rootRef }: UseEmbedHostInput) {
  const completeHandlerRef = useRef<(() => void) | null>(null);
  const lastHeightRef = useRef(0);

  const post = useCallback(
    (payload: EmbedOutboundMessage) => {
      if (typeof window === "undefined" || window.parent === window) return;
      window.parent.postMessage(embedEnvelope(payload), hostOrigin);
    },
    [hostOrigin],
  );

  const notifyError = useCallback(
    (code: EmbedErrorCode, message: string) => post({ type: "error", code, message }),
    [post],
  );

  const notifyBusy = useCallback(
    (busy: boolean, label: string) => post({ type: "busy", busy, label }),
    [post],
  );

  const notifyCompleted = useCallback(
    (input: {
      mode: "save" | "quote" | "inquiry";
      projectId: string;
      revision: number;
      productId: string;
      configurationId: string | null;
    }) => post({ type: "completed", ...input }),
    [post],
  );

  const measure = useCallback(() => {
    const element = rootRef.current;
    if (!element) return;
    const height = Math.ceil(element.getBoundingClientRect().height);
    // Sub-pixel churn during animation would otherwise flood the host with
    // resize messages and make its own layout jitter.
    if (height > 0 && Math.abs(height - lastHeightRef.current) >= 2) {
      lastHeightRef.current = height;
      post({ type: "resize", heightPx: height });
    }
  }, [post, rootRef]);

  useEffect(() => {
    post({ type: "ready", clientId, productId });
    measure();
  }, [clientId, measure, post, productId]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, rootRef]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== hostOrigin) return;
      const message = parseInboundMessage(event.data);
      if (!message) return;
      if (message.type === "remeasure") {
        lastHeightRef.current = 0;
        measure();
        return;
      }
      if (message.type === "complete") completeHandlerRef.current?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [hostOrigin, measure]);

  const onHostComplete = useCallback((handler: () => void) => {
    completeHandlerRef.current = handler;
  }, []);

  return { notifyError, notifyBusy, notifyCompleted, onHostComplete, remeasure: measure };
}
