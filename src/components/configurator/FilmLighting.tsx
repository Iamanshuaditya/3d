"use client";

import { Environment, Lightformer } from "@react-three/drei";

/** Local softboxes keep the pouch's white-film response consistent in both views. */
export function FilmLighting() {
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[-3, 5, 4]} intensity={2.4} />
      <directionalLight position={[3, 1, -4]} intensity={1.4} />
      <directionalLight position={[-2, -4, 3]} intensity={0.7} />
      <Environment resolution={128}>
        <Lightformer position={[-4, 4, 5]} scale={[5, 7, 1]} intensity={2} />
        <Lightformer position={[4, 2, -4]} rotation={[0, Math.PI, 0]} scale={[3, 6, 1]} intensity={1.2} />
      </Environment>
    </>
  );
}
