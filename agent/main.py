from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain.llms import OpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import os
import logging

# Configure structured logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="XAI Kubernetes Agent", version="1.0.0")

class IncidentContext(BaseModel):
    cluster_id: str
    misconfig_type: str
    user_query: str

class ExplanationResponse(BaseModel):
    explanation: str
    suggested_hint: str

# Initialize LangChain components
def get_xai_chain() -> LLMChain:
    try:
        llm = OpenAI(temperature=0.3, openai_api_key=os.getenv("OPENAI_API_KEY", "dummy"))
        template = """
        You are an expert Kubernetes DevSecOps tutor.
        The user has encountered a '{misconfig_type}' misconfiguration in cluster '{cluster_id}'.
        User asks: {user_query}

        Provide a brief explanation of the concept and ONE small hint to guide them, without solving it directly.
        """
        prompt = PromptTemplate(template=template, input_variables=["misconfig_type", "cluster_id", "user_query"])
        return LLMChain(llm=llm, prompt=prompt)
    except Exception as e:
        logger.warning(f"OpenAI Init Failed, running in mock mode: {e}")
        return None

@app.post("/api/v1/explain", response_model=ExplanationResponse)
async def explain_incident(context: IncidentContext):
    logger.info(f"Processing explanation for cluster: {context.cluster_id}")
    chain = get_xai_chain()
    
    if not chain:
        # Mock response for local development without API keys
        return ExplanationResponse(
            explanation="(Mock) This is a simulated RBAC error.",
            suggested_hint="(Mock) Check the RoleBinding for the default service account."
        )

    try:
        result = chain.run({
            "misconfig_type": context.misconfig_type,
            "cluster_id": context.cluster_id,
            "user_query": context.user_query
        })
        return ExplanationResponse(explanation="Generated explanation", suggested_hint=result)
    except Exception as e:
        logger.error(f"Chain execution failed: {e}")
        raise HTTPException(status_code=500, detail="Internal XAI Error")
