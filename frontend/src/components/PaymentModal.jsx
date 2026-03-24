import { useState } from "react";

// ── AuthContext stores the token under "token" key ──
const TOKEN_KEY = "token";

export default function PaymentModal({ isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("idle"); // idle | processing | success | error
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handlePayment = async () => {
    // Guard: Razorpay must already be loaded via index.html script tag
    if (!window.Razorpay) {
      setErrorMsg("Payment SDK not loaded. Please refresh the page.");
      setStep("error");
      return;
    }

    setLoading(true);
    setStep("processing");
    setErrorMsg("");

    try {
      const token = localStorage.getItem(TOKEN_KEY);

      // ── Step 1: Create order ──
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId: "credits_1000" }),
      });

      const orderData = await orderRes.json();

      if (!orderRes.ok) {
        throw new Error(orderData.error || "Order creation failed");
      }

      // ── Step 2: Open Razorpay popup ──
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amountPaise,
        currency: orderData.currency,
        name: "NexaSense AI",
        description: "1000 Credits Plan",
        order_id: orderData.razorpayOrderId,

        handler: async function (response) {
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(response),
            });

            if (verifyRes.status === 409) {
              // Already processed — treat as success
              setStep("success");
              onSuccess?.();
              return;
            }

            const verifyData = await verifyRes.json();

            if (!verifyRes.ok) {
              throw new Error(verifyData.error || "Verification failed");
            }

            setStep("success");
            onSuccess?.();
          } catch (err) {
            console.error("Verification error:", err);
            setErrorMsg(err.message || "Payment verification failed");
            setStep("error");
          }
        },

        modal: {
          ondismiss: () => {
            setStep("idle");
            setLoading(false);
          },
        },

        theme: { color: "#4f46e5" },
      };

      const rzp = new window.Razorpay(options);

      rzp.on("payment.failed", function (response) {
        console.error("Payment failed:", response.error);
        setErrorMsg(response.error?.description || "Payment failed");
        setStep("error");
        setLoading(false);
      });

      rzp.open();
      setLoading(false);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (step === "success") onSuccess?.();
    setStep("idle");
    setErrorMsg("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-violet-900/20 overflow-hidden">

        {/* Header gradient bar */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" />

        <div className="p-6">

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Icon + Title */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-100">Upgrade to Pro</h2>
            <p className="text-sm text-slate-400 mt-1">Power up with 1000 additional credits</p>
          </div>

          {/* Plan card */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Credit Pack — 1000</p>
                <p className="text-xs text-slate-400 mt-0.5">1 credit = 1 AI query</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-100">₹699</p>
                <p className="text-xs text-slate-400">one-time</p>
              </div>
            </div>

            <div className="space-y-1.5">
              {[
                "1000 AI document queries",
                "Full RAG pipeline access",
                "Priority response speed",
                "No expiry on credits",
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs text-slate-300">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status messages */}
          {step === "error" && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-red-400">{errorMsg}</p>
            </div>
          )}

          {step === "success" && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-green-400">Payment successful! 1000 credits added to your account.</p>
            </div>
          )}

          {/* CTA */}
          {step !== "success" ? (
            <button
              onClick={handlePayment}
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white
                bg-gradient-to-r from-blue-600 to-violet-600
                hover:from-blue-500 hover:to-violet-500
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 shadow-lg shadow-blue-500/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing…
                </span>
              ) : (
                "Pay ₹699 with Razorpay"
              )}
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white
                bg-green-600 hover:bg-green-500 transition-all duration-200"
            >
              Done
            </button>
          )}

          {/* Trust badge */}
          <p className="text-center text-xs text-slate-500 mt-3">
            🔒 Powered by Razorpay · Secured payment
          </p>
        </div>
      </div>
    </div>
  );
}