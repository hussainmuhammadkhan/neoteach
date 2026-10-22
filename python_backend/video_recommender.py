"""
Video Recommender — FastAPI (port 8002)
AI-powered YouTube video recommendation engine
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import re

app = FastAPI(title="Video Recommender API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Data models ─────────────────────────────────────────────
class CourseInfo(BaseModel):
    name:     str
    category: str = ""
    topics:   List[str] = []
    progress: int = 0

class RecommendRequest(BaseModel):
    courses:       List[CourseInfo] = []
    weak_topics:   List[str]        = []
    watch_history: List[str]        = []

class VideoQuery(BaseModel):
    query:    str
    label:    str
    reason:   str
    priority: str = "normal"

# ── Query templates ──────────────────────────────────────────
QUERY_TEMPLATES = {
    "beginner":     "{topic} for beginners tutorial",
    "intermediate": "{topic} explained in depth",
    "advanced":     "advanced {topic} concepts",
    "weak":         "{topic} simplified easy explanation",
    "trending":     "{topic} best practices 2024",
    "project":      "{topic} project tutorial",
    "interview":    "{topic} interview questions explained",
    "revision":     "{topic} quick revision summary",
}

CATEGORY_EXTRAS = {
    "ai & machine learning": ["neural networks tutorial", "deep learning explained"],
    "web development":       ["react hooks tutorial", "css flexbox guide"],
    "data science":          ["pandas tutorial", "matplotlib visualization"],
    "cybersecurity":         ["ethical hacking basics", "network security tutorial"],
    "mobile development":    ["flutter tutorial", "react native guide"],
    "cloud computing":       ["AWS basics tutorial", "docker kubernetes explained"],
}

def get_progress_level(progress: int) -> str:
    if progress < 25:  return "beginner"
    if progress < 60:  return "intermediate"
    return "advanced"

def extract_keywords(text: str) -> List[str]:
    words = re.findall(r'\b[A-Za-z]{4,}\b', text)
    stopwords = {'with', 'that', 'this', 'from', 'have', 'been', 'will', 'your'}
    return [w.lower() for w in words if w.lower() not in stopwords][:5]

# ── Main recommendation engine ───────────────────────────────
@app.post("/recommend")
async def recommend(request: RecommendRequest):
    queries: List[VideoQuery] = []

    # 1. Course-based recommendations
    for course in request.courses[:4]:
        level    = get_progress_level(course.progress)
        template = QUERY_TEMPLATES[level]

        # Main course query
        queries.append(VideoQuery(
            query    = template.format(topic=course.name),
            label    = f"📚 {course.name}",
            reason   = f"You are {course.progress}% through this course",
            priority = "high" if course.progress < 30 else "normal",
        ))

        # Topic-specific queries
        if course.topics:
            topic = course.topics[0]
            queries.append(VideoQuery(
                query  = f"{course.name} {topic} tutorial",
                label  = f"🎯 {topic}",
                reason = f"Next topic in {course.name}",
                priority = "normal",
            ))

        # Category extras
        cat_lower = course.category.lower()
        for cat, extra_queries in CATEGORY_EXTRAS.items():
            if cat in cat_lower:
                queries.append(VideoQuery(
                    query  = extra_queries[0],
                    label  = f"⭐ Recommended for {course.category}",
                    reason = f"Popular in {course.category}",
                    priority = "normal",
                ))
                break

    # 2. Weak topic remediation (HIGH PRIORITY)
    for weak in request.weak_topics[:2]:
        queries.insert(0, VideoQuery(
            query    = QUERY_TEMPLATES["weak"].format(topic=weak),
            label    = f"💪 Improve: {weak}",
            reason   = f"You scored below 60% — these videos will help",
            priority = "high",
        ))

    # 3. Trending / project ideas
    if request.courses:
        main_course = request.courses[0]
        queries.append(VideoQuery(
            query  = QUERY_TEMPLATES["project"].format(topic=main_course.name),
            label  = f"🚀 Build with {main_course.name}",
            reason = "Apply what you've learned in a real project",
            priority = "normal",
        ))

        queries.append(VideoQuery(
            query  = QUERY_TEMPLATES["interview"].format(topic=main_course.name),
            label  = f"💼 {main_course.name} Interview Prep",
            reason = "Prepare for job interviews",
            priority = "normal",
        ))

    # 4. Quick revision for high-progress courses
    for course in request.courses:
        if course.progress >= 70:
            queries.append(VideoQuery(
                query  = QUERY_TEMPLATES["revision"].format(topic=course.name),
                label  = f"🔄 Revise: {course.name}",
                reason = f"You're {course.progress}% done — revise key concepts",
                priority = "normal",
            ))
            break

    # Remove duplicates & limit
    seen   = set()
    unique = []
    for q in queries:
        key = q.query[:40]
        if key not in seen:
            seen.add(key)
            unique.append(q)

    # Sort: high priority first
    unique.sort(key=lambda x: 0 if x.priority == "high" else 1)

    return {
        "queries": [q.dict() for q in unique[:6]],
        "total":   len(unique),
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "video-recommender"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)