/** System message keys stored in DomainTransferMessages.message */
export const DOMAIN_TRANSFER_SYSTEM_MESSAGES = {
  DNS_INSTRUCTIONS: "__system:dns_instructions__",
  VERIFICATION_STARTED: "__system:verification_started__",
  TRANSFER_COMPLETE: "__system:transfer_complete__",
} as const;

export function isSystemMessageKey(message: string): boolean {
  return message.startsWith("__system:");
}

export const DOMAIN_TRANSFER_CNAME_TARGET =
  process.env.DOMAIN_TRANSFER_CNAME_TARGET?.trim() || "connect.ensmenu.com";

export function extractDomainHostname(domainUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(domainUrl)
    ? domainUrl
    : `https://${domainUrl}`;
  return new URL(withProtocol).hostname;
}
