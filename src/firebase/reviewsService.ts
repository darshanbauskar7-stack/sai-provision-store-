import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map((p) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface RealCustomerReview {
  id: string; // matches userId (one review per user)
  userId: string;
  customerName: string;
  rating: number;
  comment: string;
  locality?: string;
  phoneNumber?: string;
  status: 'pending' | 'approved' | 'rejected';
  isVerifiedPurchaser: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Convert Firestore Timestamp / string to formatted string
function formatTimestamp(val: unknown): string {
  if (!val) return new Date().toLocaleDateString('en-GB');
  if (val instanceof Timestamp) {
    return val.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (typeof val === 'string') return val;
  return new Date().toLocaleDateString('en-GB');
}

/**
 * Fetch all approved public reviews
 */
export async function fetchApprovedReviews(): Promise<RealCustomerReview[]> {
  if (!isFirebaseConfigured || !db) return [];
  const reviewsPath = 'reviews';
  try {
    const q = query(collection(db, reviewsPath), where('status', '==', 'approved'));
    const snapshot = await getDocs(q);
    const list: RealCustomerReview[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        userId: data.userId || d.id,
        customerName: data.customerName || 'Customer',
        rating: Number(data.rating) || 5,
        comment: data.comment || '',
        locality: data.locality || '',
        phoneNumber: data.phoneNumber || '',
        status: data.status || 'approved',
        isVerifiedPurchaser: Boolean(data.isVerifiedPurchaser),
        createdAt: formatTimestamp(data.createdAt),
        updatedAt: data.updatedAt ? formatTimestamp(data.updatedAt) : undefined,
      });
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, reviewsPath);
  }
}

/**
 * Fetch user's own review
 */
export async function fetchUserReview(userId: string): Promise<RealCustomerReview | null> {
  if (!isFirebaseConfigured || !db || !userId) return null;
  const path = `reviews/${userId}`;
  try {
    const snapshot = await getDoc(doc(db, 'reviews', userId));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return {
      id: snapshot.id,
      userId: data.userId || snapshot.id,
      customerName: data.customerName || '',
      rating: Number(data.rating) || 5,
      comment: data.comment || '',
      locality: data.locality || '',
      phoneNumber: data.phoneNumber || '',
      status: data.status || 'pending',
      isVerifiedPurchaser: Boolean(data.isVerifiedPurchaser),
      createdAt: formatTimestamp(data.createdAt),
      updatedAt: data.updatedAt ? formatTimestamp(data.updatedAt) : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Submit a new customer review (one per verified account)
 */
export async function submitCustomerReview(params: {
  userId: string;
  customerName: string;
  rating: number;
  comment: string;
  locality?: string;
  phoneNumber?: string;
}): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured. Reviews cannot be saved to the database.');
  }
  const path = `reviews/${params.userId}`;
  try {
    await setDoc(doc(db, 'reviews', params.userId), {
      userId: params.userId,
      customerName: params.customerName.trim(),
      rating: Math.max(1, Math.min(5, Math.floor(params.rating))),
      comment: params.comment.trim(),
      locality: (params.locality || '').trim(),
      phoneNumber: (params.phoneNumber || '').trim(),
      status: 'pending',
      isVerifiedPurchaser: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Edit existing review
 */
export async function updateCustomerReview(params: {
  userId: string;
  customerName: string;
  rating: number;
  comment: string;
  locality?: string;
}): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }
  const path = `reviews/${params.userId}`;
  try {
    await updateDoc(doc(db, 'reviews', params.userId), {
      customerName: params.customerName.trim(),
      rating: Math.max(1, Math.min(5, Math.floor(params.rating))),
      comment: params.comment.trim(),
      locality: (params.locality || '').trim(),
      status: 'pending', // Reverts to pending for re-moderation
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Delete customer review
 */
export async function deleteCustomerReview(userId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const path = `reviews/${userId}`;
  try {
    await deleteDoc(doc(db, 'reviews', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Admin Moderation: Fetch all reviews
 */
export async function fetchAllReviewsForAdmin(): Promise<RealCustomerReview[]> {
  if (!isFirebaseConfigured || !db) return [];
  const reviewsPath = 'reviews';
  try {
    const snapshot = await getDocs(collection(db, reviewsPath));
    const list: RealCustomerReview[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        userId: data.userId || d.id,
        customerName: data.customerName || 'Customer',
        rating: Number(data.rating) || 5,
        comment: data.comment || '',
        locality: data.locality || '',
        phoneNumber: data.phoneNumber || '',
        status: data.status || 'pending',
        isVerifiedPurchaser: Boolean(data.isVerifiedPurchaser),
        createdAt: formatTimestamp(data.createdAt),
        updatedAt: data.updatedAt ? formatTimestamp(data.updatedAt) : undefined,
      });
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, reviewsPath);
  }
}

/**
 * Admin Moderation: Update status & purchase verification
 */
export async function adminModerateReview(
  reviewId: string,
  status: 'approved' | 'rejected',
  isVerifiedPurchaser: boolean
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const path = `reviews/${reviewId}`;
  try {
    await updateDoc(doc(db, 'reviews', reviewId), {
      status,
      isVerifiedPurchaser,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
