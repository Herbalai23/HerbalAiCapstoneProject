export const registrationNameError = (input: string, label: string): string | null => {
  const name = input.trim().normalize('NFC');
  if (!name) return `${label} is required.`;
  if (name.length > 50) return `${label} must be at most 50 characters.`;
  if (!/^(?:\p{L}\p{M}*)+$/u.test(name)) return `${label} must contain letters only, without numbers or punctuation.`;
  if (Array.from(name).filter(character => /\p{L}/u.test(character)).length < 5) return `${label} must contain at least 5 letters.`;
  return null;
};
