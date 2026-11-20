"use client";

import { ReactNode } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
);

export default function StripeProvider({ children }: { children: ReactNode }) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        mode: "payment",
        currency: "vnd",
        amount: 0, // Will be updated in the form
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#f97316",
            colorBackground: "#ffffff",
            colorText: "#1f2937",
            colorDanger: "#ef4444",
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
            borderRadius: "8px",
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
