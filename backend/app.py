import io
import cv2
import numpy as np
import torch
import pathlib
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from model import ColorizationSDAEUNet, lab_denormalize

app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # replace with specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_PATH = "colorization_sdae_unet_best.pth"
IMAGE_SIZE = 256

# Model
model = ColorizationSDAEUNet().to(DEVICE)
try:
    # Fix for loading Linux-saved checkpoints on Windows (PosixPath error)
    temp = pathlib.PosixPath
    pathlib.PosixPath = pathlib.WindowsPath

    checkpoint = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)
    
    # Restore original PosixPath
    pathlib.PosixPath = temp
    
    # Handle different checkpoint formats based on notebook
    if "model_state" in checkpoint:
        model.load_state_dict(checkpoint["model_state"])
    elif "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"])
    elif "state_dict" in checkpoint:
        model.load_state_dict(checkpoint["state_dict"])
    else:
        # checkpoint=state dict
        model.load_state_dict(checkpoint)
        
    model.eval()
    print(f"Model loaded successfully from {MODEL_PATH}")
except FileNotFoundError:
    print(f"WARNING: Model file not found at {MODEL_PATH}. Inference will use random weights.")
except Exception as e:
    print(f"ERROR loading model: {e}")

def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    original_size = img.size

    img = img.resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.LANCZOS)

    rgb = np.asarray(img).astype(np.float32) / 255.0
    
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)

    L = lab[..., 0:1]
    L_norm = (L / 50.0) - 1.0

    L_tensor = torch.from_numpy(L_norm).permute(2, 0, 1).unsqueeze(0).float()
    
    return L_tensor, original_size

@app.post("/colorize")
async def colorize(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        contents = await file.read()
        L_tensor, original_size = preprocess_image(contents)
        L_tensor = L_tensor.to(DEVICE)
        
        with torch.no_grad():
            # Inference
            ab_pred = model(L_tensor)
            
            rgb_out = lab_denormalize(L_tensor, ab_pred)
            
        rgb_out = rgb_out[0]
        rgb_uint8 = (rgb_out * 255).astype(np.uint8)
        
        # Convert back to PIL to save as PNG
        out_img = Image.fromarray(rgb_uint8)
        
        out_img = out_img.resize(original_size, Image.Resampling.LANCZOS)

        buf = io.BytesIO()
        out_img.save(buf, format="PNG")
        buf.seek(0)
        
        return Response(content=buf.getvalue(), media_type="image/png")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
