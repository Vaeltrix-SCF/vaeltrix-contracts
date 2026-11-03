import { describe, expect, it } from "vitest";
import {
  extractPrecedingDocComment,
  mdxEscape,
  parseRustMethods,
  parseErrorEnum,
  parseStructs,
  parseEnums,
  buildContractSection,
} from "./generate-contract-reference.mjs";

const SAMPLE_RUST_LIB = `
pub struct SampleContract;

impl SampleContract {
    /// Initializes contract
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        Ok(())
    }

    pub fn get_value(env: Env, id: u32) -> u64 {
        42
    }
}
`;

const SAMPLE_ERRORS_RS = `
pub enum Error {
    NotAuthorized = 1,
    /// Custom documentation for ProviderNotActive
    ProviderNotActive = 2,
}
`;

const SAMPLE_STRUCTS_RS = `
/// A documented provider struct
pub struct SampleProvider {
    pub id: BytesN<32>,
    pub admin: Address,
}
`;

const SAMPLE_ENUMS_RS = `
/// A documented status enum
pub enum SampleStatus {
    Active,
    Suspended,
}
`;

describe("extractPrecedingDocComment", () => {
  it("extracts triple-slash doc comment", () => {
    const text = "/// Hello world\npub fn test() {}";
    const idx = text.indexOf("pub fn test");
    expect(extractPrecedingDocComment(text, idx)).toBe("Hello world");
  });

  it("extracts block doc comment", () => {
    const text = "/**\n * Block comment\n */\npub fn test() {}";
    const idx = text.indexOf("pub fn test");
    expect(extractPrecedingDocComment(text, idx)).toBe("Block comment");
  });

  it("returns empty string when no comment exists", () => {
    const text = "let a = 1;\npub fn test() {}";
    const idx = text.indexOf("pub fn test");
    expect(extractPrecedingDocComment(text, idx)).toBe("");
  });
});

describe("parseRustMethods", () => {
  it("parses functions from impl block", () => {
    const methods = parseRustMethods(SAMPLE_RUST_LIB, "SampleContract");
    expect(methods).toEqual([
      {
        name: "init",
        doc: "Initializes contract",
        signature: "fn init(env: Env, admin: Address) -> Result<(), Error>",
      },
      {
        name: "get_value",
        doc: "",
        signature: "fn get_value(env: Env, id: u32) -> u64",
      },
    ]);
  });
});

describe("parseErrorEnum", () => {
  it("parses numeric codes and names", () => {
    const entries = parseErrorEnum(SAMPLE_ERRORS_RS);
    expect(entries).toEqual([
      { code: 1, name: "NotAuthorized", doc: "" },
      { code: 2, name: "ProviderNotActive", doc: "Custom documentation for ProviderNotActive" },
    ]);
  });
});

describe("parseStructs", () => {
  it("parses structs and public fields", () => {
    const structs = parseStructs(SAMPLE_STRUCTS_RS);
    expect(structs).toEqual([
      {
        name: "SampleProvider",
        doc: "A documented provider struct",
        fields: ["pub id: BytesN<32>", "pub admin: Address"],
      },
    ]);
  });
});

describe("parseEnums", () => {
  it("parses enums and variants", () => {
    const enums = parseEnums(SAMPLE_ENUMS_RS);
    expect(enums).toEqual([
      {
        name: "SampleStatus",
        doc: "A documented status enum",
        variants: ["Active", "Suspended"],
      },
    ]);
  });
});

describe("mdxEscape", () => {
  it("escapes curly braces", () => {
    expect(mdxEscape("hello {world}")).toBe("hello &#123;world&#125;");
  });
});

describe("buildContractSection", () => {
  it("builds markdown section for a contract", () => {
    const section = buildContractSection({
      title: "SampleContract",
      contractId: "CSAMPLE0001",
      wasmHash: "abc123hash",
      methods: [
        {
          name: "init",
          doc: "Initializes contract",
          signature: "fn init(admin: Address) -> ()",
        },
      ],
    });

    expect(section).toContain("## SampleContract");
    expect(section).toContain("CSAMPLE0001");
    expect(section).toContain("abc123hash");
    expect(section).toContain("#### `init`");
    expect(section).toContain("Initializes contract");
  });
});
