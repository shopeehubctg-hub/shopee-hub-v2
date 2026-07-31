interface R2Bucket {
  put(
    key: string,
    value: ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    DESIGN_UPLOADS?: R2Bucket;
  };
}
