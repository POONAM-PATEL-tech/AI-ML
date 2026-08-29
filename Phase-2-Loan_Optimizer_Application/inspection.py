"""
Diagnostic script: shows exactly how the risk % is calculated for a given
income / loan_amount pair, step by step.
"""
import pickle
import numpy as np

with open('bank_ai_model.pkl', 'rb') as f:
    model = pickle.load(f)
with open('scaler.pkl', 'rb') as f:
    scaler = pickle.load(f)

# ---- Change these to whatever you want to test ----
income = 345
loan_amount = 324
# -----------------------------------------------------

print("STEP 1: Raw input")
print(f"  income = {income}, loan_amount = {loan_amount}")

print("\nSTEP 2: Scaler internals (learned from training data)")
print(f"  Feature means (income, loan_amount):  {scaler.mean_}")
print(f"  Feature std-devs (income, loan_amount): {scaler.scale_}")

raw = np.array([[income, loan_amount]])
scaled = scaler.transform(raw)
print("\nSTEP 3: Scaled input (z-scores)")
print(f"  scaled_income = {scaled[0][0]:.4f}")
print(f"  scaled_loan_amount = {scaled[0][1]:.4f}")

print("\nSTEP 4: Logistic Regression internals")
print(f"  coefficients (w_income, w_loan_amount) = {model.coef_[0]}")
print(f"  intercept (bias) = {model.intercept_[0]:.4f}")

z = (model.coef_[0][0] * scaled[0][0]) + (model.coef_[0][1] * scaled[0][1]) + model.intercept_[0]
print(f"\nSTEP 5: z = w1*x1 + w2*x2 + bias = {z:.4f}")

probability = 1 / (1 + np.exp(-z))
print(f"\nSTEP 6: Sigmoid(z) = {probability:.4f} => Risk = {probability * 100:.2f}%")

print(f"\nSTEP 7: Decision (threshold 30%): {'REJECTED' if probability >= 0.40 else 'APPROVED'}")