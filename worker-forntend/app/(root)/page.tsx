import { Appbar } from "@/components/Appbar";
import { Footer } from "@/components/footer";
import { NextTask } from "@/components/NextTask";
 

export default function Home() {
  return (
    <div>
      <Appbar/>
      <NextTask/> 
      <Footer/>
    </div>
  );
}
