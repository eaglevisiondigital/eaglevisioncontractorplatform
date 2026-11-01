/** Pure formatting only. No recipient lookup, sender evidence, outbox or transport. */
export function escapeCommunicationText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
export function brandedCommunicationHtml(
  subject: string,
  company: string,
  color: string,
  escapedContent: string,
) {
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw Error('Invalid branding color');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeCommunicationText(subject)}</title></head><body><main style="border-top:4px solid ${color}"><h1>${escapeCommunicationText(company)}</h1>${escapedContent}</main></body></html>`;
}
