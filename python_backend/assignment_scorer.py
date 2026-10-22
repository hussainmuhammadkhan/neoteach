"""
Assignment Scorer — FastAPI
Scores using both DB model answer matching + OpenAI evaluation
Also checks for plagiarism/humanization
"""
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import pdfplumber
import io
import re
import httpx
import json
from difflib import SequenceMatcher

app = FastAPI(title="Assignment Scorer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_API_KEY = "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"  # ✅ Yahan apni key daalo
OPENAI_URL     = "https://api.openai.com/v1/chat/completions"

# ══════════════════════════════════════════════════════
# Helper: Extract text from PDF
# ══════════════════════════════════════════════════════
def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ""
            for page in pdf.pages:
                text += (page.extract_text() or "") + "\n"
        return text.strip()
    except:
        return ""

# ══════════════════════════════════════════════════════
# Helper: DB-based similarity scoring
# ══════════════════════════════════════════════════════
def calculate_db_score(student_text: str, model_answer: str, rubric: str = "") -> dict:
    if not student_text or not model_answer:
        return {"score": 0, "similarity": 0, "keyword_match": 0,
                "word_count": 0, "rubric_hits": [], "rubric_miss": []}

    student_lower = student_text.lower()
    model_lower   = model_answer.lower()

    similarity    = SequenceMatcher(None, student_lower, model_lower).ratio()

    model_words   = set(re.findall(r'\b\w{4,}\b', model_lower))
    student_words = set(re.findall(r'\b\w{4,}\b', student_lower))
    stopwords     = {'this','that','with','from','have','been','they','were','will',
                     'their','there','about','which','would','could','should','these'}
    model_keywords   = model_words - stopwords
    student_keywords = student_words - stopwords
    keyword_match    = len(model_keywords & student_keywords) / max(len(model_keywords), 1)

    student_word_count = len(student_text.split())
    model_word_count   = len(model_answer.split())
    length_ratio       = min(student_word_count / max(model_word_count, 1), 1.5)
    length_score       = 1.0 if 0.5 <= length_ratio <= 1.5 else 0.5

    rubric_score = 1.0
    rubric_hits  = []
    rubric_miss  = []
    if rubric:
        rubric_points = [r.strip() for r in rubric.split('.') if len(r.strip()) > 10]
        hits = 0
        for point in rubric_points:
            point_words = set(re.findall(r'\b\w{4,}\b', point.lower())) - stopwords
            overlap = len(point_words & student_keywords) / max(len(point_words), 1)
            if overlap >= 0.3:
                hits += 1
                rubric_hits.append(point[:60])
            else:
                rubric_miss.append(point[:60])
        rubric_score = hits / max(len(rubric_points), 1)

    db_score = (
        similarity    * 0.30 +
        keyword_match * 0.40 +
        length_score  * 0.15 +
        rubric_score  * 0.15
    ) * 100

    return {
        "score":         round(min(db_score, 100)),
        "similarity":    round(similarity * 100),
        "keyword_match": round(keyword_match * 100),
        "word_count":    student_word_count,
        "rubric_hits":   rubric_hits[:3],
        "rubric_miss":   rubric_miss[:3],
    }

# ══════════════════════════════════════════════════════
# Helper: OpenAI scoring + plagiarism check
# ══════════════════════════════════════════════════════
async def openai_evaluate(student_text: str, question: str, model_answer: str, rubric: str = "") -> dict:
    try:
        prompt = f"""You are an academic evaluator. Evaluate the student's answer.

QUESTION: {question}

MODEL ANSWER (expected): {model_answer[:800]}

RUBRIC: {rubric[:400] if rubric else "Standard academic grading"}

STUDENT ANSWER: {student_text[:1000]}

Evaluate and respond ONLY with this JSON (no markdown, no extra text):
{{
  "ai_score": <0-100 integer>,
  "content_quality": "<excellent|good|average|poor>",
  "is_plagiarized": <true|false>,
  "is_ai_generated": <true|false>,
  "humanization_level": "<fully_human|likely_human|suspicious|likely_ai|ai_generated>",
  "strengths": "<1-2 sentences>",
  "improvements": "<1-2 sentences>",
  "ai_feedback": "<2-3 sentence detailed feedback>"
}}"""

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                OPENAI_URL,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model":       "gpt-4o-mini",
                    "messages":    [{"role": "user", "content": prompt}],
                    "max_tokens":  500,
                    "temperature": 0.3,
                }
            )

        if resp.status_code == 200:
            raw = resp.json()['choices'][0]['message']['content'].strip()
            raw = raw.replace('```json', '').replace('```', '').strip()
            return json.loads(raw)
        else:
            return None
    except Exception as e:
        print(f"OpenAI error: {e}")
        return None

# ══════════════════════════════════════════════════════
# Helper: Combine DB + AI scores
# ══════════════════════════════════════════════════════
def combine_scores(db_score: int, ai_score: int) -> int:
    # 40% DB matching + 60% AI evaluation
    return round(db_score * 0.20 + ai_score * 0.80)

# ══════════════════════════════════════════════════════
# POST /score-assignment — PDF upload + score
# ══════════════════════════════════════════════════════
@app.post("/score-assignment")
async def score_assignment(
    file:         UploadFile = File(...),
    model_answer: str        = Form(...),
    rubric:       str        = Form(""),
    question:     str        = Form(""),
):
    if not file.filename.endswith('.pdf'):
        return {"success": False, "error": "Only PDF files allowed"}

    pdf_bytes    = await file.read()
    student_text = extract_text_from_pdf(pdf_bytes)

    if not student_text:
        return {"success": False, "error": "Could not extract text from PDF."}

    # 1. DB-based scoring
    db_result = calculate_db_score(student_text, model_answer, rubric)

    # 2. OpenAI scoring + plagiarism
    ai_result = await openai_evaluate(student_text, question or "Assignment submission", model_answer, rubric)

    # 3. Final score
    if ai_result:
        final_score = combine_scores(db_result['score'], ai_result.get('ai_score', db_result['score']))
    else:
        final_score = db_result['score']

    # 4. Build feedback
    feedback_parts = []
    if ai_result:
        feedback_parts.append(ai_result.get('ai_feedback', ''))
        if ai_result.get('is_plagiarized'):
            feedback_parts.append("⚠️ Plagiarism detected.")
        if ai_result.get('is_ai_generated'):
            feedback_parts.append("⚠️ AI-generated content detected.")
    else:
        if db_result['similarity'] >= 60:
            feedback_parts.append("✅ Content closely matches expected answer.")
        elif db_result['similarity'] >= 30:
            feedback_parts.append("⚠️ Partial match with expected content.")
        else:
            feedback_parts.append("❌ Content does not match expected answer.")

    return {
        "success":            True,
        "score":              final_score,
        "db_score":           db_result['score'],
        "ai_score":           ai_result.get('ai_score') if ai_result else None,
        "feedback":           " ".join(feedback_parts),
        "similarity":         db_result['similarity'],
        "keywordMatch":       db_result['keyword_match'],
        "wordCount":          db_result['word_count'],
        "rubricHits":         db_result['rubric_hits'],
        "rubricMiss":         db_result['rubric_miss'],
        "is_plagiarized":     ai_result.get('is_plagiarized', False) if ai_result else False,
        "is_ai_generated":    ai_result.get('is_ai_generated', False) if ai_result else False,
        "humanization_level": ai_result.get('humanization_level', 'unknown') if ai_result else 'unknown',
        "content_quality":    ai_result.get('content_quality', 'unknown') if ai_result else 'unknown',
        "strengths":          ai_result.get('strengths', '') if ai_result else '',
        "improvements":       ai_result.get('improvements', '') if ai_result else '',
        "extracted_text":     student_text[:500] + "..." if len(student_text) > 500 else student_text,
    }


# ══════════════════════════════════════════════════════
# POST /score-case-study — Text answers + score
# ══════════════════════════════════════════════════════
class CaseStudySubmission(BaseModel):
    answers:       List[str]
    questions:     List[str]
    model_answers: List[str]
    rubric:        str = ""

@app.post("/score-case-study")
async def score_case_study(data: CaseStudySubmission):
    if not data.answers:
        return {"success": False, "error": "No answers provided"}

    total_score      = 0
    question_results = []

    for ans, q, model in zip(data.answers, data.questions, data.model_answers):
        # 1. DB score
        db_result = calculate_db_score(ans, model, data.rubric)

        # 2. OpenAI score
        ai_result = await openai_evaluate(ans, q, model, data.rubric)

        # 3. Final score
        if ai_result:
            q_score = combine_scores(db_result['score'], ai_result.get('ai_score', db_result['score']))
        else:
            q_score = db_result['score']

        total_score += q_score

        # Feedback
        if ai_result:
            q_feedback = ai_result.get('ai_feedback', '')
            if ai_result.get('is_plagiarized'):
                q_feedback += " ⚠️ Plagiarism detected."
            if ai_result.get('is_ai_generated'):
                q_feedback += " ⚠️ AI-generated content detected."
        else:
            q_feedback = "DB-based scoring used."

        question_results.append({
            "question":           q,
            "your_answer":        ans,
            "score":              q_score,
            "db_score":           db_result['score'],
            "ai_score":           ai_result.get('ai_score') if ai_result else None,
            "feedback":           q_feedback,
            "similarity":         db_result['similarity'],
            "is_plagiarized":     ai_result.get('is_plagiarized', False) if ai_result else False,
            "is_ai_generated":    ai_result.get('is_ai_generated', False) if ai_result else False,
            "humanization_level": ai_result.get('humanization_level', 'unknown') if ai_result else 'unknown',
            "strengths":          ai_result.get('strengths', '') if ai_result else '',
            "improvements":       ai_result.get('improvements', '') if ai_result else '',
        })

    avg_score = round(total_score / max(len(data.answers), 1))

    return {
        "success":          True,
        "score":            avg_score,
        "question_results": question_results,
        "feedback":         f"Overall score: {avg_score}%. "
                           + ("Great work!" if avg_score >= 70 else "Keep practicing!"),
    }


# ══════════════════════════════════════════════════════
# GET /health
# ══════════════════════════════════════════════════════
@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)