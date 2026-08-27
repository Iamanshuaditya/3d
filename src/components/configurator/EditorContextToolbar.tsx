import { useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Crop,
  Lock,
  LockOpen,
  Replace,
  Trash2,
} from "lucide-react";
import type { ContextToolbarPosition } from "@/lib/configurator/editor-selection";
import type { DesignElement } from "@/types/configurator";

type EditorContextToolbarProps = {
  element: DesignElement;
  position: ContextToolbarPosition;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayerUp: () => void;
  onLayerDown: () => void;
  onCrop?: () => void;
  onReplaceFile?: (file: File) => void;
};

function ToolbarButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function EditorContextToolbar({
  element,
  position,
  onToggleLock,
  onDuplicate,
  onDelete,
  onLayerUp,
  onLayerDown,
  onCrop,
  onReplaceFile,
}: EditorContextToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-white p-1 shadow-[0_10px_30px_rgba(15,23,42,0.2)] ring-1 ring-black/10 ${
        position.placement === "above" ? "-translate-y-full" : ""
      }`}
      style={{ left: position.left, top: position.top }}
      role="toolbar"
      aria-label="Selected object controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ToolbarButton label={element.locked ? "Unlock object" : "Lock object"} onClick={onToggleLock}>
        {element.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </ToolbarButton>
      <ToolbarButton label="Duplicate object" onClick={onDuplicate}>
        <Copy className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Move layer forward" onClick={onLayerUp}>
        <ArrowUp className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Move layer backward" onClick={onLayerDown}>
        <ArrowDown className="h-4 w-4" />
      </ToolbarButton>
      {element.type === "image" && (
        <>
          <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
          <ToolbarButton label="Crop image" onClick={() => onCrop?.()} disabled={!onCrop}>
            <Crop className="h-4 w-4" />
          </ToolbarButton>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onReplaceFile?.(file);
              event.target.value = "";
            }}
          />
          <ToolbarButton
            label="Replace image"
            onClick={() => inputRef.current?.click()}
            disabled={!onReplaceFile}
          >
            <Replace className="h-4 w-4" />
          </ToolbarButton>
        </>
      )}
      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
      <ToolbarButton label="Delete object" onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-red-600" />
      </ToolbarButton>
    </div>
  );
}
