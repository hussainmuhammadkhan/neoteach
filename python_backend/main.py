from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import torch
import numpy as np
from badge_model import (
    BadgeRecommendationModel,
    ProgressPredictionModel,
    BADGE_DEFINITIONS,
    check_earned_badges,
    normalize_features,
)

app = FastAPI(title="NeoTeach Analytics API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load Models ────────────────────────────────────────
badge_model    = BadgeRecommendationModel()
progress_model = ProgressPredictionModel()

# Use pretrained weights if available, else random init
try:
    badge_model.load_state_dict(torch.load('badge_model.pth', map_location='cpu'))
    print("✅ Badge model loaded")
except:
    print("⚠️ Using untrained badge model (random init)")

try:
    progress_model.load_state_dict(torch.load('progress_model.pth', map_location='cpu'))
    print("✅ Progress model loaded")
except:
    print("⚠️ Using untrained progress model")

badge_model.eval()
progress_model.eval()

# ── Request Models ─────────────────────────────────────
class StudentData(BaseModel):
    student_id:           str
    courses_completed:    int   = 0   # 100% complete courses
    courses_enrolled:     int   = 0   # ✅ NEW: enrolled count (for Scholar/Mentor badges)
    avg_quiz_score:       float = 0.0 # 0-100
    max_quiz_score:       float = 0.0 # 0-100
    current_streak:       int   = 0
    leaderboard_rank:     int   = 999
    total_lessons:        int   = 0   # total available in enrolled courses
    lessons_completed:    int   = 0   # ✅ NEW: actual lessons student has completed
    days_active:          int   = 0
    completed_quiz_count: int   = 0

# ══════════════════════════════════════════════════════
# POST /analyze — Main endpoint
# Returns: earned badges, recommended badges, predictions
# ══════════════════════════════════════════════════════
@app.post("/analyze")
async def analyze_student(data: StudentData):
    student_dict = data.dict()

    # 1. Rule-based earned badges
    earned_ids = check_earned_badges(student_dict)

    # 2. PyTorch — Badge recommendation
    features = normalize_features(student_dict)
    with torch.no_grad():
        badge_probs     = badge_model(features).squeeze().tolist()
        progress_preds  = progress_model(features).squeeze().tolist()

    # 3. Build badge list with progress
    badges_result = []
    for i, badge in enumerate(BADGE_DEFINITIONS):
        bid     = badge['id']
        earned  = bid in earned_ids
        prob    = badge_probs[i] if i < len(badge_probs) else 0.5

        # Calculate progress percentage
        progress = _calculate_progress(badge, student_dict)

        badges_result.append({
            "id":           bid,
            "name":         badge['name'],
            "icon":         badge['icon'],
            "description":  badge['description'],
            "rarity":       badge['rarity'],
            "earned":       earned,
            "progress":     progress,
            "ai_recommend": prob > 0.6 and not earned,
            "ai_score":     round(prob, 3),
        })

    # 4. Next recommended badges (AI picks top 3 not yet earned)
    not_earned  = [b for b in badges_result if not b['earned']]
    recommended = sorted(not_earned, key=lambda x: x['ai_score'], reverse=True)[:3]

    # 5. Progress predictions
    predictions = {
        "predicted_next_score":   round(progress_preds[0] * 100, 1),
        "predicted_streak_days":  round(progress_preds[1] * 30),
        "predicted_courses_next": round(progress_preds[2] * 10),
        "next_badge":             recommended[0]['name'] if recommended else None,
    }

    return {
        "student_id":   data.student_id,
        "badges":       badges_result,
        "recommended":  recommended,
        "predictions":  predictions,
        "earned_count": len(earned_ids),
        "total_badges": len(BADGE_DEFINITIONS),
    }

# ══════════════════════════════════════════════════════
# GET /badges — All badge definitions
# ══════════════════════════════════════════════════════
@app.get("/badges")
async def get_all_badges():
    return {"badges": BADGE_DEFINITIONS}

# ══════════════════════════════════════════════════════
# POST /train — Train model with student data
# ══════════════════════════════════════════════════════
@app.post("/train")
async def train_model(students: list[StudentData]):
    """Train model with real student data"""
    if len(students) < 5:
        return {"msg": "Need at least 5 students to train"}

    optimizer = torch.optim.Adam(badge_model.parameters(), lr=0.001)
    criterion = torch.nn.BCELoss()

    badge_model.train()
    losses = []

    for epoch in range(50):
        total_loss = 0
        for student in students:
            sd     = student.dict()
            feat   = normalize_features(sd)
            earned = check_earned_badges(sd)
            target = torch.zeros(15)
            for eid in earned:
                if eid <= 15:
                    target[eid - 1] = 1.0

            optimizer.zero_grad()
            output = badge_model(feat).squeeze()
            loss   = criterion(output, target)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        losses.append(total_loss / len(students))

    torch.save(badge_model.state_dict(), 'badge_model.pth')
    badge_model.eval()

    return {"msg": "Training complete", "final_loss": losses[-1]}

# ── Helper: calculate progress towards badge ──────────
def _calculate_progress(badge: dict, sd: dict) -> int:
    # ✅ FIXED: lessons_completed = actual done, courses_enrolled for course badges
    lessons = sd.get('lessons_completed', 0)   # ✅ actual completed lessons
    courses = sd.get('courses_enrolled', 0)     # ✅ enrolled count for course badges
    score   = sd.get('avg_quiz_score', 0)       # 0-100 scale (no division needed here)
    streak  = sd.get('current_streak', 0)
    rank    = sd.get('leaderboard_rank', 999)

    progresses = []

    if badge['min_lessons'] > 0:
        progresses.append(min(lessons / badge['min_lessons'], 1.0))   # ✅ correct field
    if badge['min_courses'] > 0:
        progresses.append(min(courses / badge['min_courses'], 1.0))   # ✅ correct field
    if badge['min_score'] > 0:
        progresses.append(min(score / badge['min_score'], 1.0))       # ✅ no double division
    if badge['min_streak'] > 0:
        progresses.append(min(streak / badge['min_streak'], 1.0))
    if badge['min_rank'] < 999:
        rank_progress = max(0, 1 - (rank - badge['min_rank']) / 100)
        progresses.append(rank_progress)

    if not progresses:
        return 100
    return round(min(sum(progresses) / len(progresses), 1.0) * 100)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)