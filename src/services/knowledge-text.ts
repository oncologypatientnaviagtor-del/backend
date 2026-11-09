const SHARED_KNOWLEDGE_PATTERN =
  /\b(hospitals?|doctors?|oncologists?|surgeons?|clinics?|bengaluru|bangalore|medcity)\b/i;

export function shouldSearchSharedKnowledge(message: string): boolean {
  return SHARED_KNOWLEDGE_PATTERN.test(message);
}
