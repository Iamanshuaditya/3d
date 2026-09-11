"use client";

import { useEffect, useRef, useState } from "react";

/** Preview pose is owned by the shared editor, including its full-screen view. */
export function useInflation(defaultValue = 1) {
  const [value, setValue] = useState(defaultValue);
  const [playing, setPlaying] = useState(false);
  const [finish, setFinish] = useState<"satin" | "gloss">("satin");
  const animation = useRef({ value: defaultValue, direction: -1 });

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previousTime: number | null = null;
    const tick = (time: number) => {
      const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      const current = animation.current;
      current.value = Math.min(1, Math.max(0, current.value + current.direction * delta / 1.6));
      if (current.value === 0) current.direction = 1;
      if (current.value === 1) current.direction = -1;
      setValue(current.value);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const change = (next: number) => {
    setPlaying(false);
    setValue(Math.min(1, Math.max(0, next)));
  };
  const toggle = () => {
    animation.current = { value, direction: value >= 1 ? -1 : 1 };
    setPlaying((current) => !current);
  };
  const reset = () => {
    setPlaying(false);
    setValue(defaultValue);
    setFinish("satin");
  };
  return { value, playing, finish, setFinish, change, toggle, reset };
}
