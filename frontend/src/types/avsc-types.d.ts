declare module "avsc/lib/types.js" {
  import type { Schema } from "avsc";
  import type { Buffer } from "buffer";

  export class Type {
    static forSchema(schema: Schema): Type;
    decode(buffer: Buffer, position?: number): { value: unknown; offset: number };
  }
}
