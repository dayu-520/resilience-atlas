import { describe, expect, it } from "vitest";
import { parseTagInput } from "./UploadDatasetDialog";

describe("parseTagInput", () => {
  it("splits Chinese comma, English comma, and spaces", () => {
    expect(parseTagInput("韧性，交通, 道路 网络")).toEqual(["韧性", "交通", "道路", "网络"]);
  });
});
