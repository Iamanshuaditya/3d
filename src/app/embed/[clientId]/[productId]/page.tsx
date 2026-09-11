import { SessionEditorPage, editorPageMetadata, type SessionEditorPageProps } from "@/components/embed/SessionEditorPage";

export const metadata = editorPageMetadata;
export const dynamic = "force-dynamic";

export default function EmbedPage(props: SessionEditorPageProps) {
  return <SessionEditorPage {...props} />;
}
