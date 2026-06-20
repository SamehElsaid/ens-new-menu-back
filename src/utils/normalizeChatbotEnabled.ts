/** Default true — only explicit false/0 disables the menu chatbot. */
export function normalizeChatbotEnabled(value: unknown): boolean {
  if (value === false || value === 0 || value === "0") return false;
  return true;
}
