export type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
  byteSize: number;
};

export interface ObjectStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  delete(key: string): Promise<void>;
}

