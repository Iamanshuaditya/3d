import * as THREE from "three";
import { frameDistanceForSphere } from "./studio-scene-presentation";

/** Fits a newly loaded product once. Later folding never owns the camera. */
export class InitialProductFraming {
  private productKey: string | null = null;
  private finished = false;

  fit(input: {
    productKey: string;
    root: THREE.Object3D | undefined;
    camera: THREE.PerspectiveCamera;
    target: THREE.Vector3;
    cancelled: boolean;
    aspect: number;
    padding: number;
    minDistance: number;
    maxDistance: number;
  }): boolean {
    if (this.productKey !== input.productKey) {
      this.productKey = input.productKey;
      this.finished = false;
    }
    if (this.finished) return false;
    if (input.cancelled) {
      this.finished = true;
      return false;
    }
    if (!input.root) return false;
    const bounds = new THREE.Box3().setFromObject(input.root);
    if (bounds.isEmpty()) return false;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return false;

    const direction = input.camera.position.clone().sub(input.target);
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
    const distance = frameDistanceForSphere({
      radius: sphere.radius,
      verticalFovDeg: input.camera.fov,
      aspect: input.aspect,
      padding: input.padding,
      minDistance: input.minDistance,
      maxDistance: input.maxDistance,
    });
    input.target.copy(sphere.center);
    input.camera.position.copy(input.target).addScaledVector(direction.normalize(), distance);
    input.camera.lookAt(input.target);
    this.finished = true;
    return true;
  }
}
