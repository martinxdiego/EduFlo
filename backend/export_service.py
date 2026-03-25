"""
EduFlow Export Service
Handles professional PDF and Word document generation
"""

from docx import Document
from docx.shared import Inches, Pt, RGBColor, Twips
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from io import BytesIO
import logging

logger = logging.getLogger(__name__)

class WorksheetExporter:
    """
    Professional export service for worksheets and exams
    """
    
    def __init__(self, worksheet_data, include_solutions=False):
        self.worksheet = worksheet_data
        self.include_solutions = include_solutions
        self.mode = worksheet_data.get('mode', 'worksheet')
        self.content = worksheet_data.get('content', {})
        
    def export_to_docx(self) -> BytesIO:
        """
        Export to Word (.docx) format
        Professional, editable template with answer lines
        """
        doc = Document()
        
        # Set page margins (A4)
        sections = doc.sections
        for section in sections:
            section.top_margin = Inches(0.8)
            section.bottom_margin = Inches(0.8)
            section.left_margin = Inches(1)
            section.right_margin = Inches(1)
        
        # Title
        title = doc.add_heading(self.worksheet.get('title', 'Arbeitsblatt'), level=1)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        # Add student name/date line for student version
        if not self.include_solutions:
            name_para = doc.add_paragraph()
            name_para.add_run('Name: ________________________    Datum: ____________')
            name_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
        
        # Metadata
        metadata = doc.add_paragraph()
        metadata.add_run(f"Klasse: {self.worksheet.get('grade')}   |   ")
        metadata.add_run(f"Fach: {self.worksheet.get('subject')}   |   ")
        difficulty_map = {'easy': 'Einfach', 'medium': 'Mittel', 'hard': 'Schwierig'}
        metadata.add_run(f"Schwierigkeit: {difficulty_map.get(self.worksheet.get('difficulty'), self.worksheet.get('difficulty'))}")
        metadata.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        # Total points for exam mode (at top)
        if self.mode == 'exam':
            total_points = self.content.get('total_points', 0)
            if not total_points:
                # Calculate if not present
                total_points = sum(q.get('points', 0) for q in self.content.get('questions', []))
            
            points_para = doc.add_paragraph()
            points_run = points_para.add_run(f"Gesamtpunkte: _____ / {total_points}")
            points_run.bold = True
            points_run.font.size = Pt(14)
            points_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        
        doc.add_paragraph()  # Spacer
        
        # Questions
        for q in self.content.get('questions', []):
            # Question number and text
            q_para = doc.add_paragraph()
            q_num = q_para.add_run(f"{q.get('number', 1)}. ")
            q_num.bold = True
            q_num.font.size = Pt(11)
            
            q_text = q_para.add_run(q.get('question', ''))
            q_text.font.size = Pt(11)
            
            # Points (exam mode only, hide in worksheet mode)
            if self.mode == 'exam' and q.get('points'):
                points_run = q_para.add_run(f"  ({q.get('points')} Punkt{'e' if q.get('points', 0) > 1 else ''})")
                points_run.font.italic = True
                points_run.font.color.rgb = RGBColor(100, 100, 100)
            
            # Options (multiple choice)
            q_type = q.get('type', 'short_answer')
            if q.get('options') and q_type == 'multiple_choice':
                for option in q['options']:
                    option_para = doc.add_paragraph()
                    option_para.add_run(f"    ○  {option}")
                    option_para.paragraph_format.space_after = Pt(4)
            
            # Answer space (if not showing solutions)
            if not self.include_solutions:
                answer_lines = q.get('answerLines', 3)
                if q_type != 'multiple_choice' and answer_lines > 0:
                    # Add answer lines
                    for _ in range(answer_lines):
                        line_para = doc.add_paragraph()
                        line_para.add_run('_' * 70)
                        line_para.paragraph_format.space_before = Pt(8)
                        line_para.paragraph_format.space_after = Pt(2)
            
            # Solution (if requested - teacher version)
            if self.include_solutions and q.get('answer'):
                answer_para = doc.add_paragraph()
                answer_label = answer_para.add_run('Lösung: ')
                answer_label.bold = True
                answer_label.font.color.rgb = RGBColor(0, 128, 0)
                answer_text = answer_para.add_run(q['answer'])
                answer_text.font.color.rgb = RGBColor(0, 128, 0)
                answer_para.paragraph_format.left_indent = Inches(0.25)
                
                # Add explanation if available
                if q.get('explanation'):
                    exp_para = doc.add_paragraph()
                    exp_label = exp_para.add_run('Erklärung: ')
                    exp_label.italic = True
                    exp_para.add_run(q['explanation'])
                    exp_para.paragraph_format.left_indent = Inches(0.25)
            
            doc.add_paragraph()  # Spacer between questions
        
        # Teacher notes (only in teacher version)
        if self.include_solutions and self.content.get('teacher_notes'):
            doc.add_page_break()
            doc.add_heading('Lehrernotizen', level=2)
            notes_para = doc.add_paragraph(self.content['teacher_notes'])
            notes_para.paragraph_format.line_spacing = 1.5
        
        # Estimated time
        if self.content.get('estimated_time'):
            time_para = doc.add_paragraph()
            time_para.add_run(f"Geschätzte Zeit: {self.content['estimated_time']}")
            time_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        
        # Save to BytesIO
        buffer = BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        
        logger.info(f"Generated DOCX export: {self.worksheet.get('id')} (solutions: {self.include_solutions})")
        return buffer
    
    def export_to_pdf(self) -> BytesIO:
        """
        Export to PDF format
        Professional A4 layout with proper typography and answer lines
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            topMargin=1.5*cm,
            bottomMargin=1.5*cm,
            leftMargin=2*cm,
            rightMargin=2*cm
        )
        
        # Styles
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=8,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        metadata_style = ParagraphStyle(
            'Metadata',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.grey,
            spaceAfter=15,
            alignment=TA_CENTER
        )
        
        name_style = ParagraphStyle(
            'NameLine',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=10,
            alignment=TA_LEFT
        )
        
        question_style = ParagraphStyle(
            'Question',
            parent=styles['Normal'],
            fontSize=11,
            spaceAfter=6,
            leftIndent=0,
            fontName='Helvetica-Bold'
        )
        
        answer_style = ParagraphStyle(
            'Answer',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#059669'),
            leftIndent=15,
            spaceAfter=8
        )
        
        option_style = ParagraphStyle(
            'Option',
            parent=styles['Normal'],
            fontSize=10,
            leftIndent=25,
            spaceAfter=4
        )
        
        line_style = ParagraphStyle(
            'AnswerLine',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.grey,
            leftIndent=15,
            spaceBefore=6,
            spaceAfter=2
        )
        
        # Build document
        story = []
        
        # Title
        story.append(Paragraph(self.worksheet.get('title', 'Arbeitsblatt'), title_style))
        
        # Name/Date line for student version
        if not self.include_solutions:
            story.append(Paragraph('Name: ________________________    Datum: ____________', name_style))
        
        # Metadata
        difficulty_map = {'easy': 'Einfach', 'medium': 'Mittel', 'hard': 'Schwierig'}
        metadata_text = f"Klasse: {self.worksheet.get('grade')} | Fach: {self.worksheet.get('subject')} | Schwierigkeit: {difficulty_map.get(self.worksheet.get('difficulty'), self.worksheet.get('difficulty'))}"
        story.append(Paragraph(metadata_text, metadata_style))
        
        # Total points box (exam mode - at top)
        if self.mode == 'exam':
            total_points = self.content.get('total_points', 0)
            if not total_points:
                total_points = sum(q.get('points', 0) for q in self.content.get('questions', []))
            
            points_data = [[f"Punkte: _____ / {total_points}"]]
            points_table = Table(points_data, colWidths=[15*cm])
            points_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#dbeafe')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1e40af')),
                ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 12),
                ('BOX', (0, 0), (-1, -1), 2, colors.HexColor('#3b82f6')),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(points_table)
            story.append(Spacer(1, 0.5*cm))
        
        # Questions
        for i, q in enumerate(self.content.get('questions', []), 1):
            q_type = q.get('type', 'short_answer')
            
            # Question text
            question_text = f"<b>{q.get('number', i)}.</b> {q.get('question', '')}"
            
            # Add points for exam mode (hide in worksheet mode)
            if self.mode == 'exam' and q.get('points'):
                question_text += f" <i><font color='#6b7280'>({q.get('points')} Punkt{'e' if q.get('points', 0) > 1 else ''})</font></i>"
            
            story.append(Paragraph(question_text, question_style))
            
            # Options (multiple choice)
            if q.get('options') and q_type == 'multiple_choice':
                for option in q['options']:
                    story.append(Paragraph(f"○  {option}", option_style))
            
            # Answer space or solution
            if self.include_solutions and q.get('answer'):
                story.append(Paragraph(f"<b>Lösung:</b> {q['answer']}", answer_style))
                if q.get('explanation'):
                    story.append(Paragraph(f"<i>Erklärung: {q['explanation']}</i>", answer_style))
            else:
                # Add answer lines for student version (except for multiple choice)
                if q_type != 'multiple_choice':
                    answer_lines = q.get('answerLines', 3)
                    for _ in range(answer_lines):
                        story.append(Paragraph('_' * 80, line_style))
            
            story.append(Spacer(1, 0.4*cm))
        
        # Estimated time
        if self.content.get('estimated_time'):
            story.append(Spacer(1, 0.5*cm))
            time_style = ParagraphStyle(
                'TimeStyle',
                parent=styles['Normal'],
                fontSize=9,
                textColor=colors.grey,
                alignment=TA_RIGHT
            )
            story.append(Paragraph(f"Geschätzte Zeit: {self.content['estimated_time']}", time_style))
        
        # Teacher notes (teacher version only)
        if self.include_solutions and self.content.get('teacher_notes'):
            story.append(PageBreak())
            story.append(Paragraph('<b>Lehrernotizen</b>', title_style))
            story.append(Spacer(1, 0.3*cm))
            story.append(Paragraph(self.content['teacher_notes'], styles['Normal']))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        
        logger.info(f"Generated PDF export: {self.worksheet.get('id')} (solutions: {self.include_solutions})")
        return buffer


def export_worksheet_pdf(worksheet_data, include_solutions=False) -> BytesIO:
    """Convenience function for PDF export"""
    exporter = WorksheetExporter(worksheet_data, include_solutions)
    return exporter.export_to_pdf()


def export_worksheet_docx(worksheet_data, include_solutions=False) -> BytesIO:
    """Convenience function for DOCX export"""
    exporter = WorksheetExporter(worksheet_data, include_solutions)
    return exporter.export_to_docx()
