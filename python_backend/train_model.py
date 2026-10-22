"""
Run this ONCE to train the model with synthetic data.
After real students use the app, retrain with /train endpoint.

Usage: python train_model.py
"""
import torch
import torch.nn as nn
import numpy as np
from badge_model import (
    BadgeRecommendationModel,
    ProgressPredictionModel,
    normalize_features,
    check_earned_badges,
)

def generate_synthetic_students(n=500):
    students = []
    for _ in range(n):
        courses  = np.random.randint(0, 8)
        lessons  = np.random.randint(0, 60)
        score    = np.random.uniform(40, 100)
        streak   = np.random.randint(0, 35)
        rank     = np.random.randint(1, 100)
        days     = np.random.randint(1, 60)
        students.append({
            'courses_completed': courses,
            'avg_quiz_score':    score,
            'max_quiz_score':    min(score + 10, 100),
            'current_streak':    streak,
            'leaderboard_rank':  rank,
            'total_lessons':     lessons,
            'days_active':       days,
        })
    return students

print("🔄 Generating synthetic training data...")
students = generate_synthetic_students(500)

# ── Train Badge Model ──────────────────────────────────
print("🔄 Training Badge Recommendation Model...")
badge_model = BadgeRecommendationModel()
optimizer   = torch.optim.Adam(badge_model.parameters(), lr=0.001)
criterion   = nn.BCELoss()

badge_model.train()
for epoch in range(100):
    total_loss = 0
    for sd in students:
        feat   = normalize_features(sd)
        earned = check_earned_badges(sd)
        target = torch.zeros(15)
        for eid in earned:
            if 1 <= eid <= 15:
                target[eid - 1] = 1.0

        optimizer.zero_grad()
        out  = badge_model(feat).squeeze()
        loss = criterion(out, target)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()

    if (epoch + 1) % 20 == 0:
        print(f"  Epoch {epoch+1}/100 — Loss: {total_loss/len(students):.4f}")

torch.save(badge_model.state_dict(), 'badge_model.pth')
print("✅ Badge model saved: badge_model.pth")

# ── Train Progress Model ───────────────────────────────
print("🔄 Training Progress Prediction Model...")
progress_model = ProgressPredictionModel()
opt2           = torch.optim.Adam(progress_model.parameters(), lr=0.001)
crit2          = nn.MSELoss()

progress_model.train()
for epoch in range(100):
    total_loss = 0
    for sd in students:
        feat   = normalize_features(sd)
        # Target: future score, streak, courses (normalized)
        target = torch.tensor([
            min(sd['avg_quiz_score'] / 100 + 0.05, 1.0),
            min(sd['current_streak'] / 30 + 0.1, 1.0),
            min(sd['courses_completed'] / 10 + 0.1, 1.0),
        ], dtype=torch.float32)

        opt2.zero_grad()
        out  = progress_model(feat).squeeze()
        loss = crit2(out, target)
        loss.backward()
        opt2.step()
        total_loss += loss.item()

    if (epoch + 1) % 20 == 0:
        print(f"  Epoch {epoch+1}/100 — Loss: {total_loss/len(students):.4f}")

torch.save(progress_model.state_dict(), 'progress_model.pth')
print("✅ Progress model saved: progress_model.pth")
print("\n🎉 Training complete! Now run: uvicorn main:app --reload --port 8000")