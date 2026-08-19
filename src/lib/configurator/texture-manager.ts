import * as THREE from "three";

/**
 * CanvasTexture configuration for printable surfaces (§37).
 *
 * Ownership lives in ProductCustomizer: one texture is created per canvas and
 * then updated in place via `needsUpdate` (§15). Creating a texture per pointer
 * move would re-upload the whole image to the GPU every frame.
 */
export function configureDesignTexture(texture: THREE.CanvasTexture, anisotropy = 8) {
  // Konva draws with y increasing downward; glTF UVs put v=0 at the bottom.
  // flipY=true reconciles the two so artwork is upright, not mirrored (§16).
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
}
