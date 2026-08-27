import type { Metadata } from "next";
import { PacdoraLab } from "@/components/pacdora-lab/PacdoraLab";

export const metadata: Metadata = {
  title: "Procedural Packaging Lab",
  description: "Research prototype for adjustable carton and flexible pouch geometry.",
};

export default function TestPage() {
  return <PacdoraLab />;
}
