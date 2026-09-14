export type ApiUser = {
  id: string;
  email: string;
  fullName: string;
  className: string | null;
  contact: string | null;
  role: "USER" | "ADMIN";
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
};

export type ApiPackage = {
  id: number;
  name: string;
  price: number;
  maximumOrders: number;
  currentOrders: number;
  isOpen: boolean;
};

export type ApiOrder = {
  id: string;
  userId: string;
  packageId: number;
  status: "PENDING" | "ACCEPTED" | "DRAWING" | "COMPLETED" | "REJECTED";
  subject: string;
  artType: string;
  style: string;
  size: string;
  colors: string;
  description: string;
  purpose: string | null;
  addText: boolean;
  addedText: string | null;
  createdAt: string;
  updatedAt: string;
  package: ApiPackage | null;
  owner: { fullName: string; email: string } | null;
  images: Array<{ id: number; objectKey: string; url: string }>;
  notes: Array<{ id: number; body: string; createdAt: string }>;
};

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadReference(file: File): Promise<{ objectKey: string; url: string }> {
  const response = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type },
    body: await file.arrayBuffer(),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Không thể tải ảnh lên.");
  }
  return response.json();
}