try:
    import torch
    import torch.nn as nn
    import numpy as np
except ImportError:
    pass

# ══════════════════════════════════════════════════════
# Badge Recommendation + Progress Prediction Model
# Input features:
#   0: courses_completed (normalized)     — 100% complete courses
#   1: avg_quiz_score (0-100 scale)
#   2: current_streak (normalized)
#   3: leaderboard_rank (normalized, 1=best)
#   4: lessons_completed (normalized)     — ✅ FIXED: actual completed, not total available
#   5: days_active (normalized)
# ══════════════════════════════════════════════════════

BADGE_DEFINITIONS = [
    # id, name, icon, description, rarity
    # min_score is on 0-100 scale
    {"id": 1,  "name": "First Steps",      "icon": "👣", "description": "Complete your first lesson",          "rarity": "common",    "min_lessons": 1,  "min_courses": 0, "min_score": 0.0,   "min_streak": 0,  "min_rank": 999},
    {"id": 2,  "name": "Fast Learner",     "icon": "⚡", "description": "Complete 5 lessons",                  "rarity": "rare",      "min_lessons": 5,  "min_courses": 0, "min_score": 0.0,   "min_streak": 0,  "min_rank": 999},
    {"id": 3,  "name": "Quiz Master",      "icon": "🎯", "description": "Score 90%+ avg on quizzes",           "rarity": "rare",      "min_lessons": 0,  "min_courses": 0, "min_score": 90.0,  "min_streak": 0,  "min_rank": 999},
    {"id": 4,  "name": "Dedicated",        "icon": "🔥", "description": "7-day learning streak",              "rarity": "epic",      "min_lessons": 0,  "min_courses": 0, "min_score": 0.0,   "min_streak": 7,  "min_rank": 999},
    {"id": 5,  "name": "Course Champion",  "icon": "🏆", "description": "Enroll in your first course",        "rarity": "epic",      "min_lessons": 0,  "min_courses": 1, "min_score": 0.0,   "min_streak": 0,  "min_rank": 999},
    {"id": 6,  "name": "Scholar",          "icon": "📚", "description": "Enroll in 3 courses",                "rarity": "epic",      "min_lessons": 0,  "min_courses": 3, "min_score": 0.0,   "min_streak": 0,  "min_rank": 999},
    {"id": 7,  "name": "Perfectionist",    "icon": "💎", "description": "Score 100% on any quiz",             "rarity": "legendary", "min_lessons": 0,  "min_courses": 0, "min_score": 100.0, "min_streak": 0,  "min_rank": 999},
    {"id": 8,  "name": "Streak King",      "icon": "👑", "description": "30-day learning streak",             "rarity": "legendary", "min_lessons": 0,  "min_courses": 0, "min_score": 0.0,   "min_streak": 30, "min_rank": 999},
    {"id": 9,  "name": "Champion",         "icon": "🥇", "description": "Reach top 10 on leaderboard",        "rarity": "legendary", "min_lessons": 0,  "min_courses": 0, "min_score": 0.0,   "min_streak": 0,  "min_rank": 10},
    {"id": 10, "name": "Knowledge Seeker", "icon": "🔍", "description": "Complete 20 lessons",                "rarity": "rare",      "min_lessons": 20, "min_courses": 0, "min_score": 0.0,   "min_streak": 0,  "min_rank": 999},
    {"id": 11, "name": "Consistent",       "icon": "📅", "description": "14-day streak",                      "rarity": "epic",      "min_lessons": 0,  "min_courses": 0, "min_score": 0.0,   "min_streak": 14, "min_rank": 999},
    {"id": 12, "name": "Top Student",      "icon": "⭐", "description": "Maintain 85%+ avg score",            "rarity": "epic",      "min_lessons": 0,  "min_courses": 0, "min_score": 85.0,  "min_streak": 0,  "min_rank": 999},
    {"id": 13, "name": "Mentor",           "icon": "🎓", "description": "Enroll in 5 courses",                "rarity": "legendary", "min_lessons": 0,  "min_courses": 5, "min_score": 0.0,   "min_streak": 0,  "min_rank": 999},
    {"id": 14, "name": "Night Owl",        "icon": "🦉", "description": "Complete 50+ total lessons",         "rarity": "common",    "min_lessons": 50, "min_courses": 0, "min_score": 0.0,   "min_streak": 0,  "min_rank": 999},
    {"id": 15, "name": "Rising Star",      "icon": "🌟", "description": "Top 5 on leaderboard",               "rarity": "legendary", "min_lessons": 0,  "min_courses": 0, "min_score": 0.0,   "min_streak": 0,  "min_rank": 5},
]

# ── PyTorch Model — Badge Recommendation ──────────────
class BadgeRecommendationModel(nn.Module):
    def __init__(self, input_size=6, hidden_size=64, output_size=15):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, output_size),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.network(x)

# ── PyTorch Model — Progress Prediction ───────────────
class ProgressPredictionModel(nn.Module):
    def __init__(self, input_size=6, hidden_size=32):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, 16),
            nn.ReLU(),
            nn.Linear(16, 3),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.network(x)

# ── Rule-based badge earning check ────────────────────
def check_earned_badges(student_data: dict) -> list:
    """Returns list of earned badge ids based on student data"""
    earned    = []

    # ✅ FIXED: lessons_completed = actual lessons done by student
    #           courses_completed = fully completed courses (100%)
    #           courses_enrolled  = enrolled (for Scholar/Mentor badges)
    lessons   = student_data.get('lessons_completed', 0)       # ✅ actual completed lessons
    courses   = student_data.get('courses_enrolled', 0)        # ✅ enrolled count for course badges
    avg_score = student_data.get('avg_quiz_score', 0)          # 0-100 scale
    max_score = student_data.get('max_quiz_score', 0)          # 0-100 scale
    streak    = student_data.get('current_streak', 0)
    rank      = student_data.get('leaderboard_rank', 999)

    for badge in BADGE_DEFINITIONS:
        # Perfectionist — needs 100% on any single quiz
        if badge['id'] == 7:
            if max_score >= 100.0:
                earned.append(badge['id'])
            continue

        if (lessons   >= badge['min_lessons']  and
            courses   >= badge['min_courses']  and
            avg_score >= badge['min_score']    and
            streak    >= badge['min_streak']   and
            rank      <= badge['min_rank']):
            earned.append(badge['id'])

    return earned

# ── Normalize student features ─────────────────────────
def normalize_features(student_data: dict) -> 'torch.Tensor':
    features = [
        min(student_data.get('courses_enrolled', 0) / 10.0, 1.0),    # ✅ enrolled for normalization
        student_data.get('avg_quiz_score', 0) / 100.0,
        min(student_data.get('current_streak', 0) / 30.0, 1.0),
        max(0, 1 - (student_data.get('leaderboard_rank', 100) / 100.0)),
        min(student_data.get('lessons_completed', 0) / 50.0, 1.0),   # ✅ FIXED: actual completed
        min(student_data.get('days_active', 0) / 30.0, 1.0),
    ]
    return torch.tensor(features, dtype=torch.float32).unsqueeze(0)