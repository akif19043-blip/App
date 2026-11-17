-- Rütbeler. Toplam puan (XP) arttıkça rütbe yükselir; silahlar rütbeyle açılır.

local Ranks = {}

Ranks.Names = {
	"Er",
	"Onbaşı",
	"Çavuş",
	"Uzman Çavuş",
	"Astsubay Çavuş",
	"Üstçavuş",
	"Başçavuş",
	"Asteğmen",
	"Teğmen",
	"Üsteğmen",
	"Yüzbaşı",
	"Binbaşı",
	"Yarbay",
	"Albay",
	"Tuğgeneral",
	"Tümgeneral",
	"Korgeneral",
	"Orgeneral",
	"Mareşal",
}

Ranks.Max = #Ranks.Names

-- n. rütbeye ulaşmak için gereken toplam puan
function Ranks.xpFor(rank)
	if rank <= 1 then
		return 0
	end
	return math.floor(450 * (rank - 1) ^ 1.55 / 50 + 0.5) * 50
end

function Ranks.fromXp(xp)
	local rank = 1
	while rank < Ranks.Max and xp >= Ranks.xpFor(rank + 1) do
		rank += 1
	end
	return rank
end

function Ranks.name(rank)
	return Ranks.Names[math.clamp(rank, 1, Ranks.Max)]
end

-- Rütbe çubuğu için: bu rütbedeki ilerleme (0..1) ve sonraki eşiğe kalan puan
function Ranks.progress(xp)
	local rank = Ranks.fromXp(xp)
	if rank >= Ranks.Max then
		return 1, 0, rank
	end
	local from = Ranks.xpFor(rank)
	local to = Ranks.xpFor(rank + 1)
	return (xp - from) / (to - from), to - xp, rank
end

return Ranks
