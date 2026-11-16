export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function field(id: string, value: string) {
  const size = new TextEncoder().encode(value).length;
  if (size > 99) throw new Error("Campo Pix excedeu o tamanho permitido.");
  return id + String(size).padStart(2, "0") + value;
}
function receiver(value: string, max: number) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 .,-]/g, "")
    .trim()
    .slice(0, max);
  if (!normalized) throw new Error("Informe o nome e a cidade do recebedor.");
  return normalized;
}
export function pixPayload(key: string, name: string, city: string) {
  const cleanKey = key.trim();
  if (!/^[\x21-\x7e]{1,77}$/.test(cleanKey))
    throw new Error("Chave Pix não configurada corretamente.");
  const payload =
    field("00", "01") +
    field("26", field("00", "br.gov.bcb.pix") + field("01", cleanKey)) +
    field("52", "0000") +
    field("53", "986") +
    field("58", "BR") +
    field("59", receiver(name, 25)) +
    field("60", receiver(city, 15)) +
    field("62", field("05", "***")) +
    "6304";
  return payload + crc16(payload);
}
