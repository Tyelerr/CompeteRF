import { BAD_WORDS } from "./badwords";

export const isValidEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const isValidPassword = (password: string): boolean => {
  return password.length >= 8;
};

export const isValidUsername = (username: string): boolean => {
  if (username.length < 3) return false;
  if (username.length > 20) return false;
  const regex = /^[a-zA-Z]+$/;
  return regex.test(username);
};

export const containsBadWord = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some((word) => lowerText.includes(word));
};

export const isValidZipCode = (zip: string): boolean => {
  const regex = /^\d{5}$/;
  return regex.test(zip);
};

export const isValidPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length === 10;
};

export const isValidAge = (birthday: string, minAge: number): boolean => {
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= minAge;
};

export const isValidFargo = (fargo: number): boolean => {
  return fargo >= 0 && fargo <= 1000;
};
