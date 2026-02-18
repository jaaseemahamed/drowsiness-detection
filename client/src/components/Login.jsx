import React, { useState } from 'react';
import { Mail, Lock, User, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const endpoint = isRegistering ? '/api/register' : '/api/login';
    const body = isRegistering
      ? { email, password, name }
      : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        if (isRegistering) {
          setIsRegistering(false);
          setIsLoading(false);
          setError('Account created! Please login.');
        } else {
          onLogin(data);
        }
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">
            <ShieldCheck size={32} />
          </div>
          <h1 className="login-title">Safety Guard</h1>
          <p className="login-subtitle">
            {isRegistering ? 'Create your safety account' : 'Sign in to access safety features'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {isRegistering && (
            <div className="form-group-login">
              <label><User size={16} /> Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                required
              />
            </div>
          )}

          <div className="form-group-login">
            <label><Mail size={16} /> Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>

          <div className="form-group-login">
            <label><Lock size={16} /> Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={isLoading} className="login-button">
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                {isRegistering ? 'Create Account' : 'Sign In'}
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            className="toggle-auth"
          >
            {isRegistering
              ? 'Already have an account? Sign In'
              : "Don't have an account? Create one"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .login-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #0d0f14;
          padding: 20px;
        }
        .login-card {
          background: #161a23;
          padding: 3rem;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          width: 100%;
          max-width: 450px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
        }
        .login-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }
        .login-icon {
          background: #3b82f6;
          color: white;
          width: 64px;
          height: 64px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
          box-shadow: 0 8px 16px rgba(59, 130, 246, 0.3);
        }
        .login-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: white;
          margin-bottom: 0.5rem;
        }
        .login-subtitle {
          color: #94a3b8;
          font-size: 0.95rem;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .form-group-login {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-group-login label {
          color: #cbd5e1;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .form-group-login input {
          background: #0d0f14;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 0.85rem 1rem;
          color: white;
          outline: none;
          transition: border-color 0.2s;
        }
        .form-group-login input:focus {
          border-color: #3b82f6;
        }
        .login-error {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.85rem;
          text-align: center;
        }
        .login-button {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 1rem;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          transition: background 0.2s;
          margin-top: 1rem;
        }
        .login-button:hover {
          background: #2563eb;
        }
        .login-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .login-footer {
          margin-top: 2rem;
          text-align: center;
        }
        .toggle-auth {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .toggle-auth:hover {
          color: #3b82f6;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Login;
