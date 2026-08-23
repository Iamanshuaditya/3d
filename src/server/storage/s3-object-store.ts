import { createHash, createHmac } from "node:crypto";
import type { ObjectStore, StoredObject } from "@/platform/storage/object-store";
import { encodeStorageKey } from "./storage-key";

type Fetcher = typeof fetch;

export type S3ObjectStoreConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Uint8Array, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function normalizeEndpoint(value: string): URL {
  const endpoint = new URL(value);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
    throw new Error("S3 endpoint must use HTTPS outside local development.");
  }
  endpoint.search = "";
  endpoint.hash = "";
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "");
  return endpoint;
}

function canonicalHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export class S3ObjectStore implements ObjectStore {
  private readonly endpoint: URL;

  constructor(
    private readonly config: S3ObjectStoreConfig,
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.endpoint = normalizeEndpoint(config.endpoint);
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) {
      throw new Error("Invalid S3 bucket name.");
    }
    if (!config.region || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error("S3 region and credentials are required.");
    }
  }

  private urlFor(key: string): URL {
    const url = new URL(this.endpoint);
    url.pathname = `${this.endpoint.pathname}/${this.config.bucket}/${encodeStorageKey(key)}`.replace(/\/{2,}/g, "/");
    return url;
  }

  private async request(
    method: "GET" | "PUT" | "DELETE",
    key: string,
    options: { body?: Uint8Array; contentType?: string; copySource?: string } = {},
  ): Promise<Response> {
    const url = this.urlFor(key);
    const body = options.body ?? new Uint8Array();
    const payloadHash = sha256(body);
    const timestamp = this.now().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = timestamp.slice(0, 8);
    const headers = new Headers({
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": timestamp,
    });
    if (options.contentType) headers.set("content-type", options.contentType);
    if (options.copySource) {
      headers.set(
        "x-amz-copy-source",
        `/${encodeURIComponent(this.config.bucket)}/${encodeStorageKey(options.copySource)}`,
      );
    }

    const signedHeaderNames = [...headers.keys()].sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${canonicalHeaderValue(headers.get(name) ?? "")}\n`)
      .join("");
    const credentialScope = `${date}/${this.config.region}/s3/aws4_request`;
    const canonicalRequest = [
      method,
      url.pathname,
      "",
      canonicalHeaders,
      signedHeaderNames.join(";"),
      payloadHash,
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      timestamp,
      credentialScope,
      sha256(canonicalRequest),
    ].join("\n");
    const signature = createHmac(
      "sha256",
      signingKey(this.config.secretAccessKey, date, this.config.region),
    ).update(stringToSign).digest("hex");
    headers.set(
      "authorization",
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`,
    );

    const requestBody = Uint8Array.from(body).buffer;
    return this.fetcher(url, {
      method,
      headers,
      ...(method === "PUT" ? { body: requestBody } : {}),
    });
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const response = await this.request("PUT", key, { body: bytes, contentType });
    if (!response.ok) throw new Error(`S3 put failed with status ${response.status}.`);
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.request("GET", key);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`S3 get failed with status ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      byteSize: bytes.byteLength,
    };
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    encodeStorageKey(sourceKey);
    const response = await this.request("PUT", destinationKey, { copySource: sourceKey });
    if (!response.ok) {
      if (response.status === 404) throw new Error(`Source object ${sourceKey} does not exist.`);
      throw new Error(`S3 copy failed with status ${response.status}.`);
    }
  }

  async delete(key: string): Promise<void> {
    const response = await this.request("DELETE", key);
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed with status ${response.status}.`);
    }
  }
}
