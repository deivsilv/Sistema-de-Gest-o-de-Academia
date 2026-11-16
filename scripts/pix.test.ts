import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { crc16, pixPayload } from "../src/pix.ts";
test("CRC16 CCITT-FALSE usa vetor conhecido", () =>
  assert.equal(crc16("123456789"), "29B1"));
test("payload reproduz exemplo oficial BCB de chave aleatória sem valor", () => {
  const code = pixPayload(
    "123e4567-e12b-12d1-a456-426655440000",
    "Fulano de Tal",
    "BRASILIA",
  );
  assert.equal(
    code,
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
  );
});
test("payload usa a chave fictícia exata e CRC correspondente", () => {
  const key = "8d72f4a1-6b3c-4e90-a125-9f08c7d63b42";
  const code = pixPayload(key, "ACADEMIA TESTE", "TESTE");
  assert.ok(code.includes("0136" + key));
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
});
test("QR Code é gerado localmente como PNG", async () => {
  const code = pixPayload(
    "8d72f4a1-6b3c-4e90-a125-9f08c7d63b42",
    "ACADEMIA TESTE",
    "TESTE",
  );
  const png = await QRCode.toDataURL(code, { width: 280, margin: 4 });
  assert.match(png, /^data:image\/png;base64,/);
  assert.ok(png.length > 500);
});
test("rejeita chave vazia e controles invisíveis", () => {
  assert.throws(() => pixPayload("", "NOME", "CIDADE"));
  assert.throws(() => pixPayload("abc\n123", "NOME", "CIDADE"));
});
