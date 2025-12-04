import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import cv2

class ConvBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )
    
    def forward(self, x):
        return self.block(x)


class UpBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        # up: in_ch -> out_ch
        self.up = nn.ConvTranspose2d(in_ch, out_ch, kernel_size=2, stride=2)
        # after concat, channels = out_ch (from up) + out_ch (from skip) = 2*out_ch
        self.conv = ConvBlock(out_ch * 2, out_ch)

    def forward(self, x, skip):
        x = self.up(x)
        if x.shape[-2:] != skip.shape[-2:]:
            diff_y = skip.size(2) - x.size(2)
            diff_x = skip.size(3) - x.size(3)
            x = F.pad(x, [diff_x // 2, diff_x - diff_x // 2,
                          diff_y // 2, diff_y - diff_y // 2])
        x = torch.cat([skip, x], dim=1)
        return self.conv(x)

class ColorizationSDAEUNet(nn.Module):

    def __init__(self, in_ch: int = 1, out_ch: int = 2, base_ch: int = 64):
        super().__init__()

        self.enc1 = ConvBlock(in_ch, base_ch)              
        self.enc2 = ConvBlock(base_ch, base_ch * 2)        
        self.enc3 = ConvBlock(base_ch * 2, base_ch * 4)    
        self.enc4 = ConvBlock(base_ch * 4, base_ch * 8)    

        self.pool = nn.MaxPool2d(2)

        # Bottleneck (center)
        self.bottleneck = ConvBlock(base_ch * 8, base_ch * 16)

        # Decoder (up)
        self.up4 = UpBlock(base_ch * 16, base_ch * 8)     
        self.up3 = UpBlock(base_ch * 8, base_ch * 4)       
        self.up2 = UpBlock(base_ch * 4, base_ch * 2)      
        self.up1 = UpBlock(base_ch * 2, base_ch)           

        self.out_conv = nn.Conv2d(base_ch, out_ch, kernel_size=1)

    def forward(self, x):
        # Encoder
        e1 = self.enc1(x)            
        p1 = self.pool(e1)           

        e2 = self.enc2(p1)          
        p2 = self.pool(e2)          

        e3 = self.enc3(p2)          
        p3 = self.pool(e3)          

        e4 = self.enc4(p3)           
        p4 = self.pool(e4)           

        # Bottleneck
        b = self.bottleneck(p4)      

        # Decoder
        d4 = self.up4(b, e4)         
        d3 = self.up3(d4, e3)        
        d2 = self.up2(d3, e2)        
        d1 = self.up1(d2, e1)        

        out_ab = self.out_conv(d1)   
        return out_ab

def lab_denormalize(L: torch.Tensor, ab: torch.Tensor):

    L_np = L.detach().cpu().numpy()
    ab_np = ab.detach().cpu().numpy()
    
    # Denormalize back to OpenCV float Lab ranges
    L_denorm = (L_np + 1.0) * 50.0    
    ab_denorm = ab_np * 128.0         
    
    lab = np.concatenate([L_denorm, ab_denorm], axis=1)   
    lab = np.transpose(lab, (0, 2, 3, 1))                 
    
    rgbs = []
    for i in range(lab.shape[0]):
        lab_i = lab[i].astype(np.float32)
        rgb_i = cv2.cvtColor(lab_i, cv2.COLOR_LAB2RGB)    
        rgb_i = np.clip(rgb_i, 0.0, 1.0)                  
        rgbs.append(rgb_i)
    
    return np.stack(rgbs, axis=0)
