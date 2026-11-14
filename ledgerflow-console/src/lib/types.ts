// Types mirror the LedgerFlow API responses exactly (paise are BIGINT strings).

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  tenant_id: string;
  role?: string;
}

export interface Wallet {
  id: string;
  currency: string;
  balance: string; // minor units (paise)
  version: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface TransactionDetail extends Transaction {
  entries: Array<{ wallet_id: string; direction: 'debit' | 'credit'; amount: string }>;
}

export interface PostedTransfer {
  id: string;
  status: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  currency: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  enabled: boolean;
  created_at: string;
  secret?: string; // returned once on create
}

export interface ApiKey {
  id: string;
  name: string;
  scopes?: string[];
  created_at: string;
  api_key?: string; // returned once on create
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export interface ApiError {
  error: { type: string; message: string; request_id?: string };
}
