export const registrationNameError = (input: string, label: string): string | null => {
  const name = input.trim().normalize('NFC');
  if (!name) return `${label} is required.`;
  if (name.length > 50) return `${label} must be at most 50 characters.`;
  if (!/^(?:\p{L}\p{M}*)+$/u.test(name)) return `${label} must contain letters only, without numbers or punctuation.`;
  const letterCount = Array.from(name).filter(character => /\p{L}/u.test(character)).length;
  if (letterCount < 5) return `${label} must contain at least 5 letters.`;
  if (letterCount > 10) return `${label} must contain at most 10 letters.`;
  return null;
};

export const registrationNameInput = (input: string): string | null => {
  const name = input.normalize('NFC');
  if (name.length > 50 || !/^[\p{L}\p{M}]*$/u.test(name)
    || Array.from(name).filter(character => /\p{L}/u.test(character)).length > 10) return null;
  return name;
};
