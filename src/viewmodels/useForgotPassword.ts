import { authService } from '@/src/models/services/auth.service';
import { useState } from 'react';

export function useForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendReset = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await authService.sendPasswordResetEmail(email);

    setLoading(false);

    if (error) {
      setError(error);
    } else {
      setSent(true);
    }
  };

  return {
    email,
    setEmail,
    loading,
    sent,
    error,
    handleSendReset,
  };
}