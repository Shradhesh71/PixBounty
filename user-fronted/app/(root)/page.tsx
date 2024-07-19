"use client";
import { Appbar } from "@/components/Appbar";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/Hero";
import { Upload } from "@/components/Upload";

export default function Home() {

  return (
    <main>
      <Appbar />
      <Hero />
      <Upload />
      {/* <Footer/> */}
    </main>
  );
}