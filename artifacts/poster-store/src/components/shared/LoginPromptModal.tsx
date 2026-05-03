import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useLocation } from "wouter";

interface LoginPromptModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginPromptModal({ open, onClose }: LoginPromptModalProps) {
  const [, navigate] = useLocation();

  const goToLogin = () => {
    onClose();
    navigate("/login");
  };

  const goToRegister = () => {
    onClose();
    navigate("/register");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm text-center">
        <div className="flex justify-center mb-2">
          <Heart className="h-10 w-10 text-secondary" />
        </div>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Log in to save posters</DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            Create an account to keep your favorite posters across devices.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button onClick={goToLogin} className="w-full">Log in</Button>
          <Button onClick={goToRegister} variant="outline" className="w-full">Create account</Button>
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Continue browsing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
