import HeroSection from "@/components/HeroSection";
import BlockStatusCards from "@/components/BlockStatusCards";
import ArchitectureFlow from "@/components/ArchitectureFlow";
import FeaturesSection from "@/components/FeaturesSection";
import WhyDifferent from "@/components/WhyDifferent";
import Footer from "@/components/Footer";
import ParticleBackground from "@/components/ParticleBackground";

const Index = () => {
  return (
    <div className="min-h-screen bg-background grid-bg relative">
      <ParticleBackground />
      <div className="relative z-10">
        <HeroSection />
        <BlockStatusCards />
        <ArchitectureFlow />
        <FeaturesSection />
        <WhyDifferent />
        <Footer />
      </div>
    </div>
  );
};

export default Index;
