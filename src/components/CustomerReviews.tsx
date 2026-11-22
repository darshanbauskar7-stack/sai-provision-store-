import React, { useState, useEffect, useRef } from 'react';
import {
  Star,
  MessageSquare,
  User,
  CheckCircle,
  ThumbsUp,
  Send,
  Pencil,
  Trash2,
  Phone,
  ShieldCheck,
  AlertTriangle,
  Lock,
  RefreshCw,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react';
import { Language } from '../types/store';
import { isFirebaseConfigured, auth } from '../firebase/config';
import {
  RealCustomerReview,
  fetchApprovedReviews,
  fetchUserReview,
  submitCustomerReview,
  updateCustomerReview,
  deleteCustomerReview,
  fetchAllReviewsForAdmin,
  adminModerateReview,
} from '../firebase/reviewsService';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  onAuthStateChanged,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';

interface CustomerReviewsProps {
  currentLanguage: Language;
}

export const CustomerReviews: React.FC<CustomerReviewsProps> = ({ currentLanguage }) => {
  // Clear any legacy demo reviews from previous turns
  useEffect(() => {
    try {
      localStorage.removeItem('sai_store_customer_reviews');
    } catch {}
  }, []);

  // Approved public reviews (strictly empty by default - NO fake reviews)
  const [reviews, setReviews] = useState<RealCustomerReview[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Authenticated customer state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userReview, setUserReview] = useState<RealCustomerReview | null>(null);

  // Phone Auth State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [authStep, setAuthStep] = useState<'phone' | 'otp' | 'verified'>('phone');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Review Form state
  const [customerName, setCustomerName] = useState('');
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [locality, setLocality] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);

  // Admin Moderation state
  const [isAdminModeOpen, setIsAdminModeOpen] = useState(false);
  const [adminReviews, setAdminReviews] = useState<RealCustomerReview[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminActionMsg, setAdminActionMsg] = useState('');

  // Check if current user is store admin
  const isStoreAdmin = currentUser?.email === 'darshanbauskar7@gmail.com';

  // Multilingual translations
  const t = {
    heading:
      currentLanguage === 'mr'
        ? 'ग्राहकांचे अभिप्राय'
        : currentLanguage === 'hi'
        ? 'ग्राहकों की समीक्षाएं'
        : 'Customer Reviews',
    subtitle:
      currentLanguage === 'mr'
        ? 'स्नेहल कॉलनी आणि गायत्री नगरमधील ग्राहकांचे खरे आणि थेट अभिप्राय'
        : currentLanguage === 'hi'
        ? 'स्नेहल कॉलोनी और गायत्री नगर के ग्राहकों के वास्तविक और सीधे अनुभव'
        : 'Genuine, verified customer feedback from Snehal Colony & Gaytri Nagar, Jalgaon',
    emptyState:
      currentLanguage === 'mr'
        ? 'अद्याप कोणतेही ग्राहक अभिप्राय नाहीत. आपला पहिला अनुभव शेअर करा.'
        : currentLanguage === 'hi'
        ? 'अभी तक कोई ग्राहक समीक्षा नहीं है। अपना अनुभव साझा करने वाले पहले व्यक्ति बनें।'
        : 'No customer reviews yet. Be the first to share your experience.',
    firebaseNotConfiguredTitle:
      currentLanguage === 'mr'
        ? 'फायरबेस बॅकएंड आवश्यक'
        : currentLanguage === 'hi'
        ? 'फायरबेस बैकएंड आवश्यक'
        : 'Firebase Backend Setup Required',
    firebaseNotConfiguredMsg:
      currentLanguage === 'mr'
        ? 'क्लाउड फायरस्टोर डेटाबेस आणि फोन ओटीपी प्रमाणीकरण अद्याप सक्रिय केलेले नाही. डेटाबेस स्टोरेज, फोन पडताळणी आणि थेट पुनरावलोकने चालू करण्यासाठी कृपया फायरबेस सेटअप स्वीकारा.'
        : currentLanguage === 'hi'
        ? 'क्लाउड फायरस्टोर डेटाबेस और फोन ओटीपी प्रमाणीकरण अभी तक सक्रिय नहीं किया गया है। डेटाबेस स्टोरेज, फोन सत्यापन और लाइव समीक्षाएं चालू करने के लिए कृपया फायरबेस सेटअप स्वीकार करें।'
        : 'Cloud Firestore database and Phone OTP Authentication are not yet configured on this applet. To enable persistent reviews and SMS OTP verification across devices, please approve the Firebase setup prompt.',
    overallRating:
      currentLanguage === 'mr' ? 'एकूण रेटिंग' : currentLanguage === 'hi' ? 'कुल रेटिंग' : 'Overall Rating',
    approvedReviewsCount:
      currentLanguage === 'mr'
        ? 'मंजूर अभिप्राय'
        : currentLanguage === 'hi'
        ? 'स्वीकृत समीक्षाएं'
        : 'approved reviews',
    noRatingsYet:
      currentLanguage === 'mr'
        ? 'अद्याप कोणतेही रेटिंग नाही'
        : currentLanguage === 'hi'
        ? 'अभी कोई रेटिंग नहीं'
        : 'No ratings yet',
    signInWithPhoneTitle:
      currentLanguage === 'mr'
        ? 'अभिप्राय देण्यासाठी फोन नंबरने पडताळणी करा'
        : currentLanguage === 'hi'
        ? 'समीक्षा देने के लिए फोन नंबर से सत्यापन करें'
        : 'Verify Mobile Number to Review',
    signInSubtitle:
      currentLanguage === 'mr'
        ? 'अविश्वसनीय व बनावट समीक्षा रोखण्यासाठी फोन ओटीपी पडताळणी आवश्यक आहे.'
        : currentLanguage === 'hi'
        ? 'फर्जी समीक्षाओं को रोकने के लिए फोन ओटीपी सत्यापन आवश्यक है।'
        : 'Phone OTP verification is required to prevent fake reviews and spam.',
    phoneLabel:
      currentLanguage === 'mr' ? 'मोबाईल नंबर (+91)' : currentLanguage === 'hi' ? 'मोबाइल नंबर (+91)' : 'Mobile Number (+91)',
    sendOtpBtn:
      currentLanguage === 'mr' ? 'ओटीपी पाठवा' : currentLanguage === 'hi' ? 'ओटीपी भेजें' : 'Send OTP via SMS',
    enterOtpLabel:
      currentLanguage === 'mr' ? '६ अंकी ओटीपी टाका' : currentLanguage === 'hi' ? '६ अंकों का ओटीपी दर्ज करें' : 'Enter 6-Digit OTP',
    verifyOtpBtn:
      currentLanguage === 'mr' ? 'ओटीपी पडताळा' : currentLanguage === 'hi' ? 'ओटीपी सत्यापित करें' : 'Verify & Continue',
    signedInAs:
      currentLanguage === 'mr' ? 'पडताळलेला नंबर' : currentLanguage === 'hi' ? 'सत्यापित नंबर' : 'Verified Number',
    logoutBtn: currentLanguage === 'mr' ? 'लॉग आउट' : currentLanguage === 'hi' ? 'लॉग आउट' : 'Sign Out',
    writeReviewTitle:
      currentLanguage === 'mr'
        ? 'आपला खरा अनुभव लिहा'
        : currentLanguage === 'hi'
        ? 'अपना वास्तविक अनुभव लिखें'
        : 'Write Your Real Experience',
    editReviewTitle:
      currentLanguage === 'mr'
        ? 'आपला अभिप्राय संपादित करा'
        : currentLanguage === 'hi'
        ? 'अपनी समीक्षा संपादित करें'
        : 'Edit Your Review',
    nameLabel: currentLanguage === 'mr' ? 'आपले नाव *' : currentLanguage === 'hi' ? 'आपका नाम *' : 'Customer Name *',
    namePlaceholder: currentLanguage === 'mr' ? 'उदा. राहुल महाजन' : currentLanguage === 'hi' ? 'उदा. राहुल महाजन' : 'e.g. Rahul Mahajan',
    localityLabel:
      currentLanguage === 'mr' ? 'परिसर / कॉलनी' : currentLanguage === 'hi' ? 'क्षेत्र / कॉलोनी' : 'Area / Locality',
    localityPlaceholder:
      currentLanguage === 'mr' ? 'उदा. स्नेहल कॉलनी' : currentLanguage === 'hi' ? 'उदा. स्नेहल कॉलोनी' : 'e.g. Snehal Colony',
    ratingLabel: currentLanguage === 'mr' ? 'रेटिंग (१ ते ५)' : currentLanguage === 'hi' ? 'रेटिंग (१ से ५)' : 'Star Rating (1 to 5)',
    commentLabel:
      currentLanguage === 'mr'
        ? 'आपला किराणा खरेदी अनुभव *'
        : currentLanguage === 'hi'
        ? 'आपका किराना खरीदारी अनुभव *'
        : 'Your Review / Experience *',
    commentPlaceholder:
      currentLanguage === 'mr'
        ? 'साई प्रोव्हिजनमधील सामान, भाव किंवा डिलिव्हरीबद्दल खरा अनुभव लिहा...'
        : currentLanguage === 'hi'
        ? 'साई प्रोविजन के सामान, मूल्य या डिलीवरी के बारे में वास्तविक अनुभव लिखें...'
        : 'Share your genuine experience about groceries, pricing, or delivery...',
    submitBtn:
      currentLanguage === 'mr' ? 'अभिप्राय पाठवा' : currentLanguage === 'hi' ? 'समीक्षा भेजें' : 'Submit Review',
    updateBtn:
      currentLanguage === 'mr' ? 'अभिप्राय अपडेट करा' : currentLanguage === 'hi' ? 'समीक्षा अपडेट करें' : 'Update Review',
    deleteBtn: currentLanguage === 'mr' ? 'अभिप्राय हटवा' : currentLanguage === 'hi' ? 'समीक्षा हटाएं' : 'Delete Review',
    cancelBtn: currentLanguage === 'mr' ? 'रद्द करा' : currentLanguage === 'hi' ? 'रद्द करें' : 'Cancel',
    pendingModerationMsg:
      currentLanguage === 'mr'
        ? 'तुमचा अभिप्राय प्राप्त झाला आहे आणि दुकानाच्या मंजुरीसाठी प्रलंबित आहे.'
        : currentLanguage === 'hi'
        ? 'आपकी समीक्षा प्राप्त हो गई है और दुकान की मंजूरी के लिए लंबित है।'
        : 'Your review was received and is pending store admin approval before appearing publicly.',
    approvedBadge:
      currentLanguage === 'mr' ? 'मंजूर' : currentLanguage === 'hi' ? 'स्वीकृत' : 'Approved',
    pendingBadge:
      currentLanguage === 'mr' ? 'मंजुरी प्रलंबित' : currentLanguage === 'hi' ? 'मंजूरी लंबित' : 'Pending Approval',
    verifiedPurchaserBadge:
      currentLanguage === 'mr'
        ? 'पडताळलेला खरेदीदार'
        : currentLanguage === 'hi'
        ? 'सत्यापित खरीदार'
        : 'Verified Purchaser',
    adminPortalBtn:
      currentLanguage === 'mr' ? 'ॲडमिन पॅनेल' : currentLanguage === 'hi' ? 'एडमिन पैनल' : 'Admin Moderation',
    ratingWords: [
      currentLanguage === 'mr' ? 'सुमार' : currentLanguage === 'hi' ? 'खराब' : 'Poor',
      currentLanguage === 'mr' ? 'साधारण' : currentLanguage === 'hi' ? 'ठीक' : 'Fair',
      currentLanguage === 'mr' ? 'चांगले' : currentLanguage === 'hi' ? 'अच्छा' : 'Good',
      currentLanguage === 'mr' ? 'खूप छान' : currentLanguage === 'hi' ? 'बहुत अच्छा' : 'Very Good',
      currentLanguage === 'mr' ? 'उत्कृष्ट' : currentLanguage === 'hi' ? 'उत्कृष्ट' : 'Excellent',
    ],
  };

  // Listen to Auth State
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setAuthStep('verified');
        try {
          const myRev = await fetchUserReview(user.uid);
          setUserReview(myRev);
          if (myRev) {
            setCustomerName(myRev.customerName);
            setRating(myRev.rating);
            setComment(myRev.comment);
            setLocality(myRev.locality || '');
          }
        } catch (err) {
          console.error('Error fetching user review:', err);
        }
      } else {
        setAuthStep('phone');
        setUserReview(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch Approved Reviews
  const loadApprovedReviews = async () => {
    setLoading(true);
    if (!isFirebaseConfigured) {
      setReviews([]);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchApprovedReviews();
      setReviews(data);
    } catch (err) {
      console.error('Error loading reviews:', err);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApprovedReviews();
  }, []);

  // Setup reCAPTCHA verifier for Phone Auth
  const setupRecaptcha = () => {
    if (!auth) return;
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {},
      });
    }
  };

  // Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!isFirebaseConfigured || !auth) {
      setAuthError(t.firebaseNotConfiguredMsg);
      return;
    }

    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    const formatted = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;

    if (cleanPhone.length < 10) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setAuthLoading(true);
    try {
      setupRecaptcha();
      if (!recaptchaVerifierRef.current) throw new Error('reCAPTCHA could not be initialized');
      const confirmation = await signInWithPhoneNumber(auth, formatted, recaptchaVerifierRef.current);
      setConfirmationResult(confirmation);
      setAuthStep('otp');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!confirmationResult) {
      setAuthError('Verification session expired. Please request a new OTP.');
      return;
    }

    if (verificationCode.length !== 6) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await confirmationResult.confirm(verificationCode);
      setCurrentUser(res.user);
      setAuthStep('verified');
      const existing = await fetchUserReview(res.user.uid);
      if (existing) {
        setUserReview(existing);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid code entered.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // Sign out
  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
    setCurrentUser(null);
    setUserReview(null);
    setAuthStep('phone');
    setIsEditing(false);
  };

  // Submit or Update Review
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!isFirebaseConfigured) {
      setFormError(t.firebaseNotConfiguredMsg);
      return;
    }

    if (!currentUser) {
      setFormError('Please sign in with your phone number before submitting a review.');
      return;
    }

    if (!customerName.trim() || customerName.trim().length < 2) {
      setFormError('Please enter your full name (at least 2 characters).');
      return;
    }

    if (!comment.trim() || comment.trim().length < 5) {
      setFormError('Please enter a review of at least 5 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (userReview) {
        // Edit existing review
        await updateCustomerReview({
          userId: currentUser.uid,
          customerName,
          rating,
          comment,
          locality,
        });
        setFormSuccess('Review updated! It has been submitted for store admin approval.');
      } else {
        // Create new review (one per user)
        await submitCustomerReview({
          userId: currentUser.uid,
          customerName,
          rating,
          comment,
          locality,
          phoneNumber: currentUser.phoneNumber || undefined,
        });
        setFormSuccess('Thank you! Your review was submitted and is pending admin moderation.');
      }
      const updated = await fetchUserReview(currentUser.uid);
      setUserReview(updated);
      setIsEditing(false);
      await loadApprovedReviews();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete own review
  const handleDeleteOwnReview = async () => {
    if (!currentUser) return;
    if (!window.confirm('Are you sure you want to delete your review?')) return;
    setSubmitting(true);
    try {
      await deleteCustomerReview(currentUser.uid);
      setUserReview(null);
      setCustomerName('');
      setComment('');
      setLocality('');
      setRating(5);
      setIsEditing(false);
      await loadApprovedReviews();
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Admin moderation: Load all reviews
  const loadAdminReviews = async () => {
    setAdminLoading(true);
    try {
      const all = await fetchAllReviewsForAdmin();
      setAdminReviews(all);
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminApprove = async (id: string, isVerifiedPurchaser: boolean) => {
    setAdminActionMsg('');
    try {
      await adminModerateReview(id, 'approved', isVerifiedPurchaser);
      setAdminActionMsg(`Review #${id.slice(0, 6)} approved.`);
      await loadAdminReviews();
      await loadApprovedReviews();
    } catch (err: unknown) {
      setAdminActionMsg(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleAdminReject = async (id: string) => {
    setAdminActionMsg('');
    try {
      await adminModerateReview(id, 'rejected', false);
      setAdminActionMsg(`Review #${id.slice(0, 6)} rejected.`);
      await loadAdminReviews();
      await loadApprovedReviews();
    } catch (err: unknown) {
      setAdminActionMsg(err instanceof Error ? err.message : 'Action failed');
    }
  };

  // Calculate real average from approved reviews only
  const totalApproved = reviews.length;
  const avgRating =
    totalApproved > 0
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / totalApproved).toFixed(1)
      : null;

  return (
    <section id="reviews" className="py-16 bg-[#FFFDF8] border-t border-amber-100">
      <div id="recaptcha-container"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/80 text-[#0F5132] text-xs font-bold uppercase tracking-wider mb-2 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>Sai Provision Stores</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F5132] tracking-tight">
            {t.heading}
          </h2>
          <p className="mt-2 text-sm text-stone-600">{t.subtitle}</p>
        </div>

        {/* Firebase Not Configured Honest Notice */}
        {!isFirebaseConfigured && (
          <div className="mb-10 max-w-3xl mx-auto bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-amber-950">
                  {t.firebaseNotConfiguredTitle}
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-amber-900 leading-relaxed">
                  {t.firebaseNotConfiguredMsg}
                </p>
                <div className="mt-3 text-[11px] text-amber-800 font-mono bg-amber-100/70 p-2.5 rounded-lg border border-amber-200">
                  Database Status: Firestore not provisioned · Security Rules ready (`firestore.rules`) · Phone Auth awaiting setup
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5-Star Summary & Phone Auth / Submission Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          {/* 5-Star Display Card (Calculated from approved reviews only) */}
          <div className="lg:col-span-5 bg-gradient-to-br from-[#0F5132] to-[#0b3c25] text-white rounded-2xl p-6 sm:p-8 shadow-md border border-emerald-800 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold tracking-wider uppercase text-amber-300">
                {t.overallRating}
              </span>

              {avgRating ? (
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-5xl sm:text-6xl font-black text-white tracking-tight font-mono">
                    {avgRating}
                  </span>
                  <div className="flex flex-col">
                    <div className="flex items-center text-amber-400">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-5 h-5 ${
                            s <= Math.round(Number(avgRating))
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-emerald-800'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-emerald-200 mt-1">
                      {totalApproved} {t.approvedReviewsCount}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 py-4">
                  <div className="flex items-center text-emerald-300/40 mb-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="w-6 h-6 stroke-emerald-600 fill-none" />
                    ))}
                  </div>
                  <p className="text-sm text-emerald-100 font-medium">
                    {t.noRatingsYet}
                  </p>
                  <p className="text-xs text-emerald-300/80 mt-1">
                    Only authentic, verified reviews approved by the store are counted.
                  </p>
                </div>
              )}

              {/* Star Breakdown (Real counts only) */}
              <div className="mt-6 space-y-2.5 pt-6 border-t border-emerald-800/80">
                {[5, 4, 3, 2, 1].map((s) => {
                  const count = reviews.filter((r) => r.rating === s).length;
                  const pct = totalApproved > 0 ? (count / totalApproved) * 100 : 0;
                  return (
                    <div key={s} className="flex items-center text-xs gap-3">
                      <span className="w-12 text-emerald-200 font-semibold flex items-center gap-1 shrink-0">
                        <span>{s}</span>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400 inline" />
                      </span>
                      <div className="flex-1 h-2 bg-emerald-950/80 rounded-full overflow-hidden border border-emerald-800/60">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-emerald-300 text-[11px] shrink-0">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Anti-Fake-Review Guarantee */}
            <div className="mt-8 pt-6 border-t border-emerald-800/80 text-xs text-emerald-200 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <CheckCircle className="w-4 h-4 text-amber-400" />
                <span>Zero Fake Reviews Guarantee</span>
              </span>
              <span className="text-amber-300 font-bold">Sai Stores</span>
            </div>
          </div>

          {/* Customer Verification & Review Form Card */}
          <div className="lg:col-span-7 bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-stone-200">
            {/* Step 1: If user is not authenticated, show Phone OTP prompt */}
            {!currentUser ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-[#0F5132] flex items-center justify-center font-bold">
                    <Phone className="w-4 h-4 text-[#0F5132]" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-stone-900 leading-tight">
                      {t.signInWithPhoneTitle}
                    </h3>
                    <p className="text-[11px] text-stone-500">{t.signInSubtitle}</p>
                  </div>
                </div>

                {authError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                    {authError}
                  </div>
                )}

                {authStep === 'phone' ? (
                  <form onSubmit={handleSendOtp} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        {t.phoneLabel}
                      </label>
                      <div className="flex gap-2">
                        <span className="inline-flex items-center px-3 rounded-xl bg-stone-100 border border-stone-300 text-xs font-semibold text-stone-700">
                          🇮🇳 +91
                        </span>
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="9876543210"
                          maxLength={10}
                          className="flex-1 px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:border-[#0F5132] focus:ring-1 focus:ring-[#0F5132] bg-white text-stone-900 font-mono"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="btn-pop w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F5132] hover:bg-[#0c4128] text-white font-bold text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {authLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-amber-300" />}
                      <span>{t.sendOtpBtn}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        {t.enterOtpLabel}
                      </label>
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        className="w-full sm:w-64 px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:border-[#0F5132] focus:ring-1 focus:ring-[#0F5132] bg-white text-stone-900 font-mono tracking-widest text-center text-lg"
                        required
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="btn-pop inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F5132] hover:bg-[#0c4128] text-white font-bold text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {authLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 text-amber-300" />}
                        <span>{t.verifyOtpBtn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthStep('phone')}
                        className="px-3 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900"
                      >
                        Change Number
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* Step 2: User is Verified with Phone Auth */
              <div>
                {/* Verified User Header Strip */}
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-200 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-semibold text-stone-800">
                      {t.signedInAs}: <span className="font-mono text-emerald-800">{currentUser.phoneNumber || currentUser.email || 'Verified Account'}</span>
                    </span>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-red-700 transition-colors"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>{t.logoutBtn}</span>
                  </button>
                </div>

                {/* If user already has a review and not currently editing, display their review card with Edit / Delete */}
                {userReview && !isEditing ? (
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 mb-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                          Your Submitted Review
                        </span>
                        <h4 className="font-bold text-stone-900 text-sm mt-0.5">
                          {userReview.customerName}
                        </h4>
                        {userReview.locality && (
                          <span className="text-[11px] text-stone-500">{userReview.locality}</span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          userReview.status === 'approved'
                            ? 'bg-emerald-200 text-emerald-900'
                            : userReview.status === 'rejected'
                            ? 'bg-red-200 text-red-900'
                            : 'bg-amber-200 text-amber-900'
                        }`}
                      >
                        {userReview.status === 'approved'
                          ? t.approvedBadge
                          : userReview.status === 'rejected'
                          ? 'Rejected'
                          : t.pendingBadge}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 my-2">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${
                            s <= userReview.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-stone-300'
                          }`}
                        />
                      ))}
                      <span className="text-xs font-bold text-stone-700 ml-1">
                        {userReview.rating}.0
                      </span>
                    </div>

                    <p className="text-xs text-stone-700 leading-relaxed italic bg-white/70 p-3 rounded-lg border border-emerald-100">
                      "{userReview.comment}"
                    </p>

                    {userReview.status === 'pending' && (
                      <p className="text-[11px] text-amber-800 mt-2 font-medium">
                        {t.pendingModerationMsg}
                      </p>
                    )}

                    <div className="mt-4 pt-3 border-t border-emerald-200/60 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="btn-pop inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F5132] text-white text-xs font-bold shadow-xs hover:bg-[#0c4128]"
                      >
                        <Pencil className="w-3 h-3 text-amber-300" />
                        <span>{t.editReviewTitle}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteOwnReview}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-red-700 hover:bg-red-50 text-xs font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{t.deleteBtn}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Review Input Form (Create or Edit) */
                  <form onSubmit={handleSubmitReview} className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-4 h-4 text-[#0F5132]" />
                      <h3 className="text-sm font-bold text-stone-900">
                        {isEditing ? t.editReviewTitle : t.writeReviewTitle}
                      </h3>
                    </div>

                    {formSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{formSuccess}</span>
                      </div>
                    )}

                    {formError && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                        {formError}
                      </div>
                    )}

                    {/* Star Rating Selector */}
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">
                        {t.ratingLabel}
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-amber-50/70 p-2 rounded-xl border border-amber-200">
                          {[1, 2, 3, 4, 5].map((s) => {
                            const isFilled = (hoverRating || rating) >= s;
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setRating(s)}
                                onMouseEnter={() => setHoverRating(s)}
                                onMouseLeave={() => setHoverRating(0)}
                                className="p-1 text-stone-300 hover:scale-110 transition-transform cursor-pointer"
                              >
                                <Star
                                  className={`w-6 h-6 ${
                                    isFilled
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-stone-300'
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-md border border-amber-200">
                          {t.ratingWords[(hoverRating || rating) - 1]} ({hoverRating || rating}/5)
                        </span>
                      </div>
                    </div>

                    {/* Customer Name & Locality */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">
                          {t.nameLabel}
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder={t.namePlaceholder}
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:border-[#0F5132] bg-white text-stone-900"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">
                          {t.localityLabel}
                        </label>
                        <input
                          type="text"
                          value={locality}
                          onChange={(e) => setLocality(e.target.value)}
                          placeholder={t.localityPlaceholder}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:border-[#0F5132] bg-white text-stone-900"
                        />
                      </div>
                    </div>

                    {/* Review text */}
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        {t.commentLabel}
                      </label>
                      <textarea
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={t.commentPlaceholder}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:border-[#0F5132] bg-white text-stone-900"
                        required
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="btn-pop inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#0F5132] hover:bg-[#0c4128] text-white font-bold text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {submitting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5 text-amber-300" />
                        )}
                        <span>{isEditing ? t.updateBtn : t.submitBtn}</span>
                      </button>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2.5 rounded-xl bg-stone-200 text-stone-700 font-semibold text-xs"
                        >
                          {t.cancelBtn}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Public Approved Reviews List (ONLY approved reviews displayed) */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-stone-200">
            <h3 className="text-base sm:text-lg font-bold text-[#0F5132] flex items-center gap-2">
              <span>{t.heading}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-mono">
                {reviews.length}
              </span>
            </h3>

            {/* Admin Moderation Button */}
            {isStoreAdmin && (
              <button
                type="button"
                onClick={() => {
                  setIsAdminModeOpen(!isAdminModeOpen);
                  if (!isAdminModeOpen) loadAdminReviews();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-900 text-amber-300 text-xs font-bold hover:bg-emerald-800 transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{t.adminPortalBtn}</span>
              </button>
            )}
          </div>

          {/* Admin Moderation Drawer / Panel */}
          {isAdminModeOpen && isStoreAdmin && (
            <div className="mb-8 p-5 bg-stone-900 text-white rounded-2xl border border-stone-700 shadow-lg">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Store Admin Review Moderation</span>
                </div>
                <button
                  onClick={loadAdminReviews}
                  className="text-xs text-amber-300 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh Queue</span>
                </button>
              </div>

              {adminActionMsg && (
                <div className="mb-3 p-2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs">
                  {adminActionMsg}
                </div>
              )}

              {adminLoading ? (
                <div className="text-xs text-stone-400 py-4 text-center">Loading reviews queue...</div>
              ) : adminReviews.length === 0 ? (
                <div className="text-xs text-stone-400 py-4 text-center">No reviews in database yet.</div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {adminReviews.map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 bg-stone-800 rounded-xl border border-stone-700 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{r.customerName}</span>
                          <span className="text-amber-400 font-mono">★ {r.rating}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded ${
                              r.status === 'approved'
                                ? 'bg-emerald-900 text-emerald-300'
                                : r.status === 'rejected'
                                ? 'bg-red-950 text-red-300'
                                : 'bg-amber-950 text-amber-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                        <p className="text-stone-300 mt-1 italic">"{r.comment}"</p>
                        <div className="text-[10px] text-stone-400 mt-1 flex gap-3">
                          <span>Date: {r.createdAt}</span>
                          {r.locality && <span>Area: {r.locality}</span>}
                          {r.phoneNumber && <span>Phone: {r.phoneNumber}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {r.status !== 'approved' && (
                          <button
                            onClick={() => handleAdminApprove(r.id, false)}
                            className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px]"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => handleAdminApprove(r.id, true)}
                          className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-slate-900 font-bold text-[11px]"
                          title="Verify that this customer made a real in-store purchase"
                        >
                          Approve + Verify Purchase
                        </button>
                        {r.status !== 'rejected' && (
                          <button
                            onClick={() => handleAdminReject(r.id)}
                            className="px-2.5 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-medium text-[11px]"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Honest Empty State when no approved reviews exist */}
          {reviews.length === 0 ? (
            <div className="text-center py-12 px-4 bg-stone-50/80 rounded-2xl border border-dashed border-stone-300">
              <MessageSquare className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-600 font-medium text-sm sm:text-base">
                {t.emptyState}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="bg-white rounded-xl p-5 border border-stone-200 shadow-xs hover:border-amber-200 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h4 className="font-bold text-stone-900 text-sm">
                          {rev.customerName}
                        </h4>
                        {rev.locality && (
                          <span className="text-[11px] text-stone-500 block">
                            {rev.locality}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-stone-400 font-mono shrink-0">
                        {rev.createdAt}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 mb-2.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= rev.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-stone-300'
                          }`}
                        />
                      ))}
                      <span className="text-[11px] font-bold text-stone-700 ml-1">
                        {rev.rating}.0
                      </span>
                    </div>

                    <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">
                      "{rev.comment}"
                    </p>
                  </div>

                  {/* Verification footer: ONLY shows Verified Purchaser if actually verified by store admin */}
                  <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px]">
                    {rev.isVerifiedPurchaser ? (
                      <span className="inline-flex items-center gap-1 text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{t.verifiedPurchaserBadge}</span>
                      </span>
                    ) : (
                      <span className="text-stone-400 text-[10px]">
                        Customer Feedback
                      </span>
                    )}
                    <span className="text-stone-400 text-[10px]">Sai Provision Store</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
