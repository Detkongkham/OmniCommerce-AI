import { signBody } from "../facebook/signature";

/** ສົ່ງ webhook ທີ່ເຊັນຖືກຕ້ອງດ້ວຍ app secret ໄປທີ່ URL ຂອງ API */
export async function postSignedWebhook(options: { url: string; appSecret: string; payload: unknown }): Promise<Response> {
  const body = JSON.stringify(options.payload);
  return fetch(options.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signBody(options.appSecret, body) },
    body,
  });
}
